import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { creditosDeServicio, correspondeReembolso, estadoCreditos, reembolsarConsulta, reservarConsulta } from '../../../lib/imei-credits'
import { SERVICIOS, consultarImei, enmascararImei, etiquetaEstado, modoImeicheck, validarImei, type EscenarioMock } from '../../../lib/imeicheck'
import { findImeiProvider, publicImeiProviders } from '../../../lib/imei-providers'
import { moduloGuard } from '../../../lib/modulos-guard'

// Flujo de consulta de IMEI (#193) — FASE 1 (mocks).
//
// - `precheck`: valida el IMEI y muestra servicio, campos y **costo ANTES** de
//   ejecutar. Nunca llama al proveedor ni cobra.
// - `checks`: ejecuta la consulta **solo con confirmación explícita**
//   (`confirm: true`) y con `requestId` idempotente: el mismo id no vuelve a
//   cobrar (clic repetido, reintento o dos pestañas). Queda registrada con
//   proveedor, servicio, estado, costo real, fecha, id externo, respuesta
//   original (protegida) y campos normalizados.
// - La respuesta original solo se sirve a ADMIN/GERENTE; el IMEI siempre va
//   enmascarado en los listados.
const ROLES_VER_CRUDO = ['ADMIN', 'GERENTE']
const ROLES_CONSULTA = ['stock:manage', 'products:manage', 'tradeins:receive', 'stock:read']

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  if (!canAccessAny(session.user, ROLES_CONSULTA)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const verCrudo = ROLES_VER_CRUDO.includes(session.user.role)
  const imei = validarImei(params.get('imei') ?? '')
  if (params.has('imei') && !imei.ok) return error(imei.error, 400)
  const consultas = await prisma.imeiCheckQuery.findMany({
    where: { tenantId: tenant, ...(imei.ok ? { imei: imei.imei } : {}) },
    orderBy: { requestedAt: 'desc' },
    take: Math.min(50, Math.max(1, Number(params.get('limit')) || 20)),
  })
  const creditos = await estadoCreditos(tenant)
  return json({
    ...modoImeicheck(),
    proveedores: publicImeiProviders().map((provider) => ({ ...provider, estado: provider.availability })),
    creditos: { saldo: creditos.saldo, enforce: creditos.enforce },
    // Sin precios: la app solo habla de verificaciones (créditos).
    servicios: Object.fromEntries(Object.entries(SERVICIOS).map(([clave, s]) => [clave, { nombre: s.nombre, campos: s.campos, creditos: creditosDeServicio(clave) }])),
    consultas: consultas.map(fila => ({
      id: fila.id,
      imei: fila.imeiMasked,
      provider: fila.provider,
      serviceKey: fila.serviceKey,
      serviceId: fila.serviceId,
      serviceName: fila.serviceName,
      status: fila.status,
      etiqueta: etiquetaEstado(fila.status as never),
      error: fila.error,
      normalized: fila.normalized,
      requestedAt: fila.requestedAt,
      resolvedAt: fila.resolvedAt,
      conciliatedAt: fila.conciliatedAt,
      ...(verCrudo ? { responseRaw: fila.responseRaw } : {}),
    })),
  })
}

export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, 'verificacion-imei'); if (moduloApagado) return moduloApagado
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ROLES_CONSULTA)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  let body: any
  try { body = await request.json() } catch { return error('Cuerpo inválido.') }
  const proveedorId = typeof body?.proveedor === 'string' ? body.proveedor : 'imeicheck.net'
  const proveedor = findImeiProvider(proveedorId)
  if (!proveedor) return error('Proveedor IMEI no disponible.', 400)
  // IMEI.info se anuncia como próximo, pero permanece cerrado hasta contar con
  // contrato, sandbox y secreto configurados. Nunca se hace fallback silencioso.
  if (proveedor.id !== 'imeicheck.net') return error('Este proveedor está próximamente disponible y todavía no ejecuta consultas.', 409, { proveedor: proveedor.id, disponibilidad: proveedor.availability })
  const accion = body?.action === 'precheck' ? 'precheck' : body?.action === 'checks' ? 'checks' : body?.action === 'reportar' ? 'reportar' : null
  if (!accion) return error('Acción inválida: usá precheck, checks o reportar.')
  // «Reportar problema»: el inquilino solo avisa. No cambia estado, costo ni saldo:
  // la conciliación y el reembolso los decide la plataforma (/superadmin) con los
  // datos del proveedor.
  if (accion === 'reportar') {
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : ''
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!requestId && !id) return error('Indicá requestId o id de la consulta.')
    const nota = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
    if (!nota) return error('Contanos qué pasó con la consulta.')
    const registro = await prisma.imeiCheckQuery.findFirst({ where: { tenantId: tenant, ...(id ? { id } : { requestId }) } })
    if (!registro) return error('No se encontró la consulta.', 404)
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'IMEI_QUERY_REPORTED', entity: 'ImeiCheckQuery', entityId: registro.id, metadata: { requestId: registro.requestId, nota } } })
    return json({ ok: true, ...expectativa(registro, false) })
  }
  const clave = typeof body?.servicio === 'string' && SERVICIOS[body.servicio] ? body.servicio : 'APPLE_BASIC'
  const servicio = SERVICIOS[clave]
  // QA de la Fase 1: en modo mock se puede forzar un escenario (parcial,
  // pendiente, timeout, sin saldo) sin llamar al proveedor. Con IMEICHECK_LIVE=1
  // se ignora por completo: en vivo nunca se simula una respuesta.
  const ESCENARIOS_MOCK: EscenarioMock[] = ['ok', 'parcial', 'pendiente', 'timeout', 'sin-saldo', 'no-autorizado', 'imei-invalido']
  const escenarioMock = process.env.IMEICHECK_LIVE === '1' || typeof body?.escenario !== 'string' || !ESCENARIOS_MOCK.includes(body.escenario as EscenarioMock) ? undefined : (body.escenario as EscenarioMock)
  const validacion = validarImei(body?.imei)
  if (!validacion.ok) return error(validacion.error, 400, { imei: String(body?.imei ?? '').slice(0, 40) })

  if (accion === 'precheck') {
    const modo = modoImeicheck()
    // Referencia de idempotencia: una consulta igual y reciente se avisa acá.
    const reciente = await prisma.imeiCheckQuery.findFirst({
      where: { tenantId: tenant, imei: validacion.imei, serviceKey: clave, requestedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { requestedAt: 'desc' },
      select: { id: true, status: true, requestedAt: true },
    })
    const estado = await estadoCreditos(tenant)
    const requeridos = creditosDeServicio(clave)
    return json({
      ...modo,
      simulado: modo.modo === 'simulado',
      imei: enmascararImei(validacion.imei),
      servicio: { clave, nombre: servicio.nombre, campos: servicio.campos },
      requiereConfirmacion: true,
      // Sin precios ni compra: solo cuántas verificaciones usa y cuántas quedan.
      creditosRequeridos: requeridos,
      saldo: estado.saldo,
      disponible: !estado.enforce || estado.saldo >= requeridos,
      advertencia: reciente ? 'Ya hay una consulta de este servicio para el mismo IMEI en las últimas 24 h.' : null,
      reciente,
    })
  }

  // Confirmación explícita: sin `confirm: true` no se ejecuta ni se cobra.
  if (body?.confirm !== true) return error('La consulta necesita confirmación explícita.', 409, { requiereConfirmacion: true, creditosRequeridos: creditosDeServicio(clave) })
  const requestId = typeof body?.requestId === 'string' && body.requestId.trim() ? body.requestId.trim().slice(0, 128) : null
  if (!requestId) return error('Falta requestId para evitar dobles cobros.', 400)
  const verCrudo = ROLES_VER_CRUDO.includes(session.user.role)
  // Todo lookup por (tenantId, requestId): el requestId de otra empresa nunca se lee.
  const propia = () => prisma.imeiCheckQuery.findFirst({ where: { tenantId: tenant, requestId } })
  // Reserva + descuento de créditos en una sola transacción bajo el candado de la
  // empresa: la unicidad (empresa, requestId) decide quién consulta y solo quien
  // reserva descuenta y llama al proveedor (sin doble cobro).
  let reserva
  try {
    const r = await reservarConsulta({
      tenantId: tenant,
      requestId,
      servicioKey: clave,
      buscar: tx => tx.imeiCheckQuery.findFirst({ where: { tenantId: tenant, requestId } }),
      crear: tx => tx.imeiCheckQuery.create({
        data: {
          tenantId: tenant,
          branchId: session.user.branchId,
          userId: session.user.id,
          imei: validacion.imei,
          imeiMasked: enmascararImei(validacion.imei),
          provider: 'imeicheck.net',
          serviceKey: clave,
          serviceId: servicio.serviceId,
          serviceName: servicio.nombre,
          status: 'reservado',
          costUsd: '0.00',
          requestId,
        },
      }),
    })
    if (r.tipo === 'existente') return json({ ...expectativa(r.fila, verCrudo), ...(r.fila.status === 'reservado' ? { enCurso: true } : {}) }, { status: 200 })
    if (r.tipo === 'sin-creditos') {
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'IMEI_QUERY_LIMIT_REJECTED', entity: 'ImeiCheckQuery', metadata: { provider: 'imeicheck.net', serviceKey: clave, imeiMasked: enmascararImei(validacion.imei), requeridos: r.requeridos, saldo: r.saldo } } }).catch(() => {})
      return json({ message: 'No disponible en tu cuenta.', code: 'IMEI_SIN_CREDITOS', creditos: { saldo: r.saldo, requeridos: r.requeridos } }, { status: 402 })
    }
    reserva = r.fila
  } catch (causa: any) {
    if (causa?.code !== 'P2002') throw causa
    const existente = await propia()
    // Si el requestId es de OTRA empresa no se devuelve nada suyo.
    if (!existente) return error('requestId en uso', 409)
    return json({ ...expectativa(existente, verCrudo), ...(existente.status === 'reservado' ? { enCurso: true } : {}) }, { status: 200 })
  }

  // El proveedor se llama fuera de cualquier transacción y una sola vez.
  let resultado
  try {
    resultado = await consultarImei({ imei: validacion.imei, servicio: clave, escenario: escenarioMock })
  } catch (causa) {
    console.error('imei: falló la consulta al proveedor', causa)
    // Ambiguo: pudo haberse cobrado. Queda a conciliar, nunca se reintenta sola.
    resultado = { estado: 'conciliar' as const, etiqueta: 'A conciliar', campos: [], crudo: null, costoUsd: servicio.precioUsd, esMock: false, error: 'Error inesperado al consultar al proveedor: queda a conciliar (no se reintenta sola).' }
  }
  const registro = await prisma.imeiCheckQuery.update({
    where: { id: reserva.id },
    data: {
      status: resultado.estado,
      costUsd: String(resultado.costoUsd.toFixed(2)),
      externalId: (resultado.crudo as any)?.id ? String((resultado.crudo as any).id).slice(0, 128) : null,
      responseRaw: (resultado.crudo ?? null) as any,
      normalized: resultado.campos as any,
      error: resultado.error ?? null,
      resolvedAt: resultado.estado === 'pendiente' ? null : new Date(),
    },
  })
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'IMEI_QUERY_EXECUTED', entity: 'ImeiCheckQuery', entityId: registro.id, metadata: { provider: registro.provider, serviceKey: clave, status: registro.status, imeiMasked: registro.imeiMasked, requestId: registro.requestId } } }).catch(() => {})
  // Falló sin cobro del proveedor: se devuelve el crédito, una sola vez. «A conciliar» lo conserva.
  if (correspondeReembolso(resultado.estado, resultado.costoUsd)) {
    try { await reembolsarConsulta(tenant, reserva.id) } catch (causa) { console.error('imei: no se pudo reembolsar el crédito', causa) }
  }
  const estado = await estadoCreditos(tenant).catch(() => null)
  return json({ ...expectativa(registro, verCrudo), esMock: resultado.esMock, ...modoImeicheck(), ...(estado ? { creditos: { saldo: estado.saldo, enforce: estado.enforce } } : {}) }, { status: 201 })
}

function expectativa(fila: any, verCrudo: boolean) {
  return {
    id: fila.id,
    imei: fila.imeiMasked ?? enmascararImei(fila.imei),
    provider: fila.provider,
    serviceKey: fila.serviceKey,
    serviceId: fila.serviceId,
    serviceName: fila.serviceName,
    status: fila.status,
    etiqueta: etiquetaEstado(fila.status),
    error: fila.error,
    normalized: fila.normalized,
    requestedAt: fila.requestedAt,
    resolvedAt: fila.resolvedAt,
    conciliatedAt: fila.conciliatedAt,
    ...(verCrudo ? { responseRaw: fila.responseRaw } : {}),
  }
}
