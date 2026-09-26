import { ProductCondition } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { consolidarNecesidades, normalizarNecesidadManual, NECESIDAD_ESTADOS, type NecesidadEntrada } from '../../../../lib/supply'
import { puedeVerCliente } from '../../../../lib/supply-demand'

// #250 Fase 1 (Centro de Abastecimiento): API mínima del panel «Por comprar».
//
// - GET  /api/supply/needs  → necesidades abiertas consolidadas (agrupa por
//   producto + condición y conserva los destinos: pedido, reserva o reposición).
// - POST /api/supply/needs  → carga manual de una necesidad (origen MANUAL).
// - PATCH /api/supply/needs → asignar comprador o cancelar (queda auditado).
//
// Sin UI y sin automatismos todavía: nada llama a esta ruta y ninguna venta o
// reserva genera necesidades por sí sola (Fase 2). Tampoco crea stock: eso pasa
// recién en la recepción (Fase 5).
// «Por comprar» = lo que falta comprar: sin asignar y con comprador asignado.
// Lo COMPRADO vive en su propia pestaña (`?status=COMPRADA`).
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
  const limite = Math.min(500, Math.max(1, Number(params.get('limit')) || 200))

  const filas = await prisma.supplyNeed.findMany({
    where: {
      tenantId: tenant,
      status: estado && (NECESIDAD_ESTADOS as readonly string[]).includes(estado) ? estado : { in: ESTADOS_PENDIENTES },
      ...(branchId ? { branchId } : {}),
      ...(productId ? { productId } : {}),
      ...(assignedToId ? { assignedToId } : {}),
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

  // El cliente de la venta/reserva vinculada: el nombre solo para quien puede
  // gestionar clientes (`customers:manage`); el resto ve el id y la tarjeta
  // sabe que hay un cliente detrás (`clienteOculto`).
  const verCliente = puedeVerCliente(session.user.permissions)
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
  }))
  const grupos = consolidarNecesidades(entradas)

  return json({
    fecha: new Date().toISOString(),
    totales: {
      necesidades: entradas.length,
      grupos: grupos.length,
      unidades: entradas.reduce((suma, entrada) => suma + entrada.cantidad, 0),
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
  if (!id) return error('Indicá la necesidad.')
  const accion = body?.action === 'assign' ? 'assign' : body?.action === 'cancel' ? 'cancel' : null
  if (!accion) return error('Acción inválida: usá assign o cancel.')

  const necesidad = await prisma.supplyNeed.findFirst({ where: { id, tenantId: tenant } })
  if (!necesidad) return error('Necesidad no encontrada.', 404)
  if (necesidad.status === 'CANCELADA' || necesidad.status === 'RECIBIDA') return error('La necesidad ya está cerrada.', 409)

  if (accion === 'assign') {
    const assignedToId = typeof body?.assignedToId === 'string' ? body.assignedToId.trim() : ''
    if (!assignedToId) return error('Indicá el comprador.')
    const comprador = await prisma.user.findFirst({ where: { id: assignedToId, tenantId: tenant }, select: { id: true, name: true } })
    if (!comprador) return error('Usuario no encontrado.', 404)
    const actualizada = await prisma.$transaction(async (tx) => {
      const fila = await tx.supplyNeed.update({ where: { id: necesidad.id }, data: { assignedToId: comprador.id, status: 'ASIGNADA' } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_NEED_ASSIGNED', entity: 'SupplyNeed', entityId: fila.id, metadata: { assignedToId: comprador.id, assignedTo: comprador.name } } })
      return fila
    })
    return json(actualizada)
  }

  const motivo = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (motivo.length < 3) return error('Indicá el motivo de la cancelación (mínimo 3 caracteres).')
  const actualizada = await prisma.$transaction(async (tx) => {
    const fila = await tx.supplyNeed.update({ where: { id: necesidad.id }, data: { status: 'CANCELADA', notes: motivo.slice(0, 500) } })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_NEED_CANCELLED', entity: 'SupplyNeed', entityId: fila.id, metadata: { reason: motivo.slice(0, 500) } } })
    return fila
  })
  return json(actualizada)
}
