import { ProductCondition } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { consolidarNecesidades, normalizarNecesidadManual, NECESIDAD_ESTADOS, NECESIDAD_PRIORIDADES, type NecesidadEntrada } from '../../../../lib/supply'
import { normalizarCentro, prioridadPorPromesa } from '../../../../lib/supply-demand'

// #250 Fase 1 (Centro de Abastecimiento): API del panel «Por comprar».
//
// - GET  /api/supply/needs  → necesidades abiertas consolidadas (agrupa por
//   producto + condición + centro y conserva los destinos: pedido, reserva o
//   reposición) con contadores para las pestañas del panel.
// - POST /api/supply/needs  → carga manual de una necesidad (origen MANUAL).
// - PATCH /api/supply/needs → asignar comprador/centro (de a una o en bloque),
//   ajustar prioridad/fecha prometida o cancelar con motivo; todo auditado.
//
// La demanda automática la genera el motor (backend/lib/supply-demand.ts) en la
// venta, la reserva y los mínimos. No crea stock: eso pasa en la recepción (F5).
// «Por comprar» = lo que falta comprar: ABIERTA + ASIGNADA. Lo COMPRADO vive en
// su propia pestaña (`?status=COMPRADA`).
const ESTADOS_PENDIENTES = ['ABIERTA', 'ASIGNADA']

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const estado = (params.get('status') || '').trim().toUpperCase()
  const branchId = (params.get('branchId') || '').trim()
  const productId = (params.get('productId') || '').trim()
  const assignedToId = (params.get('assignedToId') || params.get('compradorId') || '').trim()
  const origin = (params.get('origin') || params.get('centro') || '').trim().toUpperCase()
  const sinAsignar = params.get('sinAsignar') === '1' || params.get('sinAsignar') === 'true'
  const sinCentro = params.get('sinCentro') === '1' || params.get('sinCentro') === 'true'
  const prioridad = (params.get('priority') || params.get('prioridad') || '').trim().toUpperCase()
  const condicion = (params.get('condition') || params.get('condicion') || '').trim().toUpperCase()
  const limite = Math.min(500, Math.max(1, Number(params.get('limit')) || 200))

  const filas = await prisma.supplyNeed.findMany({
    where: {
      tenantId: tenant,
      status: estado && (NECESIDAD_ESTADOS as readonly string[]).includes(estado) ? estado : { in: ESTADOS_PENDIENTES },
      ...(branchId ? { branchId } : {}),
      ...(productId ? { productId } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(sinAsignar ? { assignedToId: null } : {}),
      ...(origin ? { origin } : {}),
      ...(sinCentro ? { origin: null } : {}),
      ...(prioridad && (NECESIDAD_PRIORIDADES as readonly string[]).includes(prioridad) ? { priority: prioridad } : {}),
      ...(condicion && ['NEW', 'USED', 'REFURBISHED'].includes(condicion) ? { condition: condicion as ProductCondition } : {}),
    },
    include: {
      product: { select: { name: true } },
      branch: { select: { name: true } },
      order: { select: { orderNumber: true } },
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limite,
  })

  // El nombre del cliente sale solo para administración/gerencia (#250 §4).
  const verCliente = ['ADMIN', 'GERENTE'].includes(session.user.role)
  const entradas: NecesidadEntrada[] = filas.map((fila) => ({
    id: fila.id,
    productId: fila.productId,
    producto: fila.product?.name || '',
    condicion: fila.condition,
    cantidad: fila.quantity,
    prioridad: fila.priority,
    origen: fila.source,
    prometidaEl: fila.promisedAt,
    sucursalId: fila.branchId,
    sucursal: fila.branch?.name || null,
    pedidoId: fila.orderId,
    pedidoNumero: fila.order?.orderNumber || null,
    clienteId: fila.customerId,
    cliente: verCliente ? fila.customer?.name || null : null,
    centro: fila.origin,
  }))
  const grupos = consolidarNecesidades(entradas)

  // Contadores del panel (sobre toda la empresa, no solo la página): pestañas,
  // prioridades y colas de trabajo del comprador.
  const ahora = new Date()
  const [porEstado, porPrioridad, vencidas, sinAsignarTotal, sinCentroTotal] = await Promise.all([
    prisma.supplyNeed.groupBy({ by: ['status'], where: { tenantId: tenant }, _count: { _all: true } }),
    prisma.supplyNeed.groupBy({ by: ['priority'], where: { tenantId: tenant, status: { in: ESTADOS_PENDIENTES } }, _count: { _all: true } }),
    prisma.supplyNeed.count({ where: { tenantId: tenant, status: { in: ESTADOS_PENDIENTES }, promisedAt: { lt: ahora } } }),
    prisma.supplyNeed.count({ where: { tenantId: tenant, status: { in: ESTADOS_PENDIENTES }, assignedToId: null } }),
    prisma.supplyNeed.count({ where: { tenantId: tenant, status: { in: ESTADOS_PENDIENTES }, origin: null } }),
  ])
  const contar = (filas: Array<{ _count: { _all: number } } & Record<string, unknown>>, clave: string, valores: readonly string[]) =>
    Object.fromEntries(valores.map((valor) => [valor, filas.find((fila) => fila[clave] === valor)?._count._all || 0]))

  return json({
    fecha: ahora.toISOString(),
    totales: {
      necesidades: entradas.length,
      grupos: grupos.length,
      unidades: entradas.reduce((suma, entrada) => suma + entrada.cantidad, 0),
    },
    contadores: {
      porEstado: contar(porEstado as never, 'status', NECESIDAD_ESTADOS),
      porPrioridad: contar(porPrioridad as never, 'priority', NECESIDAD_PRIORIDADES),
      vencidas,
      sinAsignar: sinAsignarTotal,
      sinCentro: sinCentroTotal,
      pendientes: porEstado.filter((fila) => ESTADOS_PENDIENTES.includes(String(fila.status))).reduce((suma, fila) => suma + fila._count._all, 0),
    },
    grupos,
  })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  let body: unknown
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const normalizada = normalizarNecesidadManual(body)
  if (!normalizada.ok) return error(normalizada.error)
  const { productId, branchId, quantity, condition, priority, promisedAt, notes } = normalizada.data
  const centro = normalizarCentro((body as { origin?: unknown })?.origin)
  if (!centro.ok) return error(centro.error)

  const producto = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true, branchId: true } })
  if (!producto) return error('Producto no encontrado.', 404)
  if (branchId) {
    const sucursal = await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant }, select: { id: true } })
    if (!sucursal) return error('Sucursal no encontrada.', 404)
  }

  const creada = await prisma.$transaction(async (tx) => {
    const necesidad = await tx.supplyNeed.create({
      data: {
        tenantId: tenant,
        branchId: branchId || producto.branchId,
        productId,
        condition: condition as ProductCondition,
        quantity,
        source: 'MANUAL',
        priority,
        status: 'ABIERTA',
        promisedAt: promisedAt ? new Date(promisedAt) : null,
        notes,
        origin: centro.centro,
        createdById: session.user.id,
      },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'SUPPLY_NEED_CREATED',
        entity: 'SupplyNeed',
        entityId: necesidad.id,
        metadata: { productId, branchId: necesidad.branchId, quantity, condition, priority, source: 'MANUAL' },
      },
    })
    return necesidad
  })
  return json(creada, { status: 201 })
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  // Asignación masiva: el panel asigna un grupo consolidado (varias necesidades
  // con la misma variante/centro) de una sola vez.
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((valor: unknown): valor is string => typeof valor === 'string' && valor.trim().length > 0).map((valor: string) => valor.trim()))].slice(0, 200)
    : []
  if (!id && !ids.length) return error('Indicá la necesidad o las necesidades.')
  const accion = ['assign', 'cancel', 'update'].includes(String(body?.action)) ? body.action as 'assign' | 'cancel' | 'update' : null
  if (!accion) return error('Acción inválida: usá assign, update o cancel.')
  if (accion === 'cancel' && ids.length) return error('La cancelación es de a una necesidad (con motivo).')
  const claves = ids.length ? ids : [id]

  const necesidades = await prisma.supplyNeed.findMany({ where: { id: { in: claves }, tenantId: tenant }, select: { id: true, status: true, priority: true, promisedAt: true } })
  if (necesidades.length !== claves.length) return error('Una o más necesidades no existen.', 404)
  if (necesidades.some((fila) => fila.status === 'CANCELADA' || fila.status === 'RECIBIDA')) return error('Alguna necesidad ya está cerrada.', 409)

  if (accion === 'assign') {
    const quiereComprador = body?.assignedToId !== undefined
    const quiereCentro = body?.origin !== undefined
    if (!quiereComprador && !quiereCentro) return error('Indicá el comprador o el centro de compra.')
    const assignedToId = typeof body?.assignedToId === 'string' ? body.assignedToId.trim() : ''
    const comprador = assignedToId ? await prisma.user.findFirst({ where: { id: assignedToId, tenantId: tenant }, select: { id: true, name: true } }) : null
    if (assignedToId && !comprador) return error('Usuario no encontrado.', 404)
    const centro = normalizarCentro(body?.origin)
    if (!centro.ok) return error(centro.error)
    const actualizadas = await prisma.$transaction(async (tx) => {
      if (quiereComprador && !comprador) {
        // Se libera el comprador: las que estaban asignadas vuelven a la cola.
        await tx.supplyNeed.updateMany({ where: { id: { in: claves }, tenantId: tenant, status: 'ASIGNADA' }, data: { status: 'ABIERTA' } })
      }
      if (quiereComprador) {
        await tx.supplyNeed.updateMany({ where: { id: { in: claves }, tenantId: tenant }, data: { assignedToId: comprador?.id ?? null } })
        if (comprador) await tx.supplyNeed.updateMany({ where: { id: { in: claves }, tenantId: tenant }, data: { status: 'ASIGNADA' } })
      }
      if (quiereCentro) await tx.supplyNeed.updateMany({ where: { id: { in: claves }, tenantId: tenant }, data: { origin: centro.centro } })
      const metadatos = { assignedToId: comprador?.id ?? null, assignedTo: comprador?.name ?? null, ...(quiereCentro ? { origin: centro.centro } : {}) }
      for (const clave of claves) {
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_NEED_ASSIGNED', entity: 'SupplyNeed', entityId: clave, metadata: metadatos } })
      }
      return tx.supplyNeed.findMany({ where: { id: { in: claves }, tenantId: tenant } })
    })
    return json(ids.length ? { actualizadas: actualizadas.length, necesidades: actualizadas } : actualizadas[0])
  }

  if (accion === 'update') {
    // Prioridades y fechas del panel: se ajustan de a una o sobre el grupo
    // consolidado entero. Sin prioridad explícita, la fecha recalcula la
    // prioridad (vencida ⇒ URGENTE, ≤48 h ⇒ ALTA).
    const quierePrioridad = body?.priority !== undefined
    const quiereFecha = body?.promisedAt !== undefined
    if (!quierePrioridad && !quiereFecha) return error('Indicá la prioridad o la fecha prometida.')
    let prioridad: string | null = null
    if (quierePrioridad) {
      const valor = typeof body.priority === 'string' ? body.priority.trim().toUpperCase() : ''
      if (!(NECESIDAD_PRIORIDADES as readonly string[]).includes(valor)) return error('Prioridad inválida.')
      prioridad = valor
    }
    let promesa: Date | null = null
    if (quiereFecha && body.promisedAt !== null && body.promisedAt !== '') {
      promesa = new Date(String(body.promisedAt))
      if (Number.isNaN(promesa.getTime())) return error('La fecha prometida no es válida.')
    }
    const datos: Record<string, unknown> = {}
    if (quiereFecha) datos.promisedAt = promesa
    if (quierePrioridad) datos.priority = prioridad
    else if (quiereFecha && promesa) datos.priority = prioridadPorPromesa(promesa)
    const actualizadas = await prisma.$transaction(async (tx) => {
      await tx.supplyNeed.updateMany({ where: { id: { in: claves }, tenantId: tenant }, data: datos as never })
      for (const necesidad of necesidades) {
        await tx.auditLog.create({
          data: {
            tenantId: tenant,
            userId: session.user.id,
            action: 'SUPPLY_NEED_UPDATED',
            entity: 'SupplyNeed',
            entityId: necesidad.id,
            metadata: { previous: { priority: necesidad.priority, promisedAt: necesidad.promisedAt ? necesidad.promisedAt.toISOString() : null }, next: { ...(quierePrioridad ? { priority: prioridad } : {}), ...(quiereFecha ? { promisedAt: promesa ? promesa.toISOString() : null } : {}) } },
          },
        })
      }
      return tx.supplyNeed.findMany({ where: { id: { in: claves }, tenantId: tenant } })
    })
    return json(ids.length ? { actualizadas: actualizadas.length, necesidades: actualizadas } : actualizadas[0])
  }

  const motivo = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (motivo.length < 3) return error('Indicá el motivo de la cancelación (mínimo 3 caracteres).')
  const actualizada = await prisma.$transaction(async (tx) => {
    const fila = await tx.supplyNeed.update({ where: { id: claves[0] }, data: { status: 'CANCELADA', notes: motivo.slice(0, 500) } })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_NEED_CANCELLED', entity: 'SupplyNeed', entityId: fila.id, metadata: { reason: motivo.slice(0, 500) } } })
    return fila
  })
  return json(actualizada)
}
