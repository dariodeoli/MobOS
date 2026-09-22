import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { SERVICIOS, consultarImei, enmascararImei, etiquetaEstado, modoImeicheck, validarImei, type EscenarioMock } from '../../../lib/imeicheck'

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
  const consultas = await prisma.imeiCheckQuery.findMany({
    where: { tenantId: tenant, ...(imei.ok ? { imei: imei.imei } : {}) },
    orderBy: { requestedAt: 'desc' },
    take: Math.min(50, Math.max(1, Number(params.get('limit')) || 20)),
  })
  return json({
    ...modoImeicheck(),
    servicios: SERVICIOS,
    consultas: consultas.map(fila => ({
      id: fila.id,
      imei: fila.imeiMasked,
      provider: fila.provider,
      serviceKey: fila.serviceKey,
      serviceId: fila.serviceId,
      serviceName: fila.serviceName,
      status: fila.status,
      etiqueta: etiquetaEstado(fila.status as never),
      costUsd: Number(fila.costUsd),
      externalId: fila.externalId,
      error: fila.error,
      normalized: fila.normalized,
      requestedAt: fila.requestedAt,
      resolvedAt: fila.resolvedAt,
      ...(verCrudo ? { responseRaw: fila.responseRaw } : {}),
    })),
  })
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ROLES_CONSULTA)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  let body: any
  try { body = await request.json() } catch { return error('Cuerpo inválido.') }
  const accion = body?.action === 'precheck' ? 'precheck' : body?.action === 'checks' ? 'checks' : null
  if (!accion) return error('Acción inválida: usá precheck o checks.')
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
    // Referencia de idempotencia: una consulta igual y reciente se avisa acá.
    const reciente = await prisma.imeiCheckQuery.findFirst({
      where: { tenantId: tenant, imei: validacion.imei, serviceKey: clave, requestedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { requestedAt: 'desc' },
      select: { id: true, status: true, costUsd: true, requestedAt: true },
    })
    const simulado = modoImeicheck().modo === 'simulado'
    return json({
      ...modoImeicheck(),
      imei: enmascararImei(validacion.imei),
      servicio: { clave, ...servicio },
      requiereConfirmacion: true,
      // En simulado no hay cobro: el precio queda solo como referencia visible.
      costoEstimadoUsd: simulado ? 0 : servicio.precioUsd,
      costoReferenciaUsd: servicio.precioUsd,
      ...(simulado ? { simulado: true } : {}),
      advertencia: reciente ? 'Ya hay una consulta de este servicio para el mismo IMEI en las últimas 24 h.' : null,
      reciente,
    })
  }

  // Confirmación explícita: sin `confirm: true` no se ejecuta ni se cobra.
  if (body?.confirm !== true) return error('La consulta necesita confirmación explícita del costo.', 409, { requiereConfirmacion: true, costoEstimadoUsd: servicio.precioUsd })
  const requestId = typeof body?.requestId === 'string' && body.requestId.trim() ? body.requestId.trim().slice(0, 128) : null
  if (!requestId) return error('Falta requestId para evitar dobles cobros.', 400)
  const yaExiste = await prisma.imeiCheckQuery.findUnique({ where: { requestId } })
  if (yaExiste) return json(expectativa(yaExiste, ROLES_VER_CRUDO.includes(session.user.role)), { status: 200 })

  const resultado = await consultarImei({ imei: validacion.imei, servicio: clave, escenario: escenarioMock })
  const registro = await prisma.imeiCheckQuery.create({
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
      status: resultado.estado,
      costUsd: String(resultado.costoUsd.toFixed(2)),
      externalId: (resultado.crudo as any)?.id ? String((resultado.crudo as any).id).slice(0, 128) : null,
      responseRaw: (resultado.crudo ?? null) as any,
      normalized: resultado.campos as any,
      requestId,
      error: resultado.error ?? null,
      resolvedAt: resultado.estado === 'pendiente' ? null : new Date(),
    },
  })
  return json({ ...expectativa(registro, ROLES_VER_CRUDO.includes(session.user.role)), esMock: resultado.esMock, ...modoImeicheck() }, { status: 201 })
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
    costUsd: Number(fila.costUsd),
    externalId: fila.externalId,
    error: fila.error,
    normalized: fila.normalized,
    requestedAt: fila.requestedAt,
    resolvedAt: fila.resolvedAt,
    ...(verCrudo ? { responseRaw: fila.responseRaw } : {}),
  }
}
