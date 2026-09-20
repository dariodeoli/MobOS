import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession, effectivePermissions } from '../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../lib/payment-input'
import { canAccessOrder } from '../../../../../lib/orders'
import { canManageDelivery, deliveryBalance } from '../../../../../lib/delivery'
import { grantOrderDeliveryAuthorization } from '../../../../../lib/authorizations'

// El local asigna (o libera) el pedido a un repartidor. La asignación queda
// auditada; con `allowUnpaidDelivery` gerencia además habilita la entrega con
// saldo para ese repartidor (misma autorización de un solo uso del panel de
// venta, no un atajo: sin eso el repartidor no puede entregar con saldo).
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManageDelivery(session.user)) return error('No autorizado para asignar repartos.', 403)
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some(key => !['assignedToId', 'allowUnpaidDelivery', 'note'].includes(key))) throw new InputError('Campo no admitido al asignar el reparto.')
    const rawAssignee = body.assignedToId
    const assignedToId = rawAssignee === null || rawAssignee === undefined || rawAssignee === '' ? null : textInput(rawAssignee, 'Repartidor', 200)
    const allowUnpaidDelivery = body.allowUnpaidDelivery === true
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Motivo', 500)
    if (allowUnpaidDelivery && !assignedToId) throw new InputError('Elegí el repartidor antes de autorizar la entrega con saldo.')
    const existing = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant },
      select: { id: true, orderNumber: true, status: true, branchId: true, sellerId: true, fulfillmentStatus: true, totalPyg: true, assignedToId: true },
    })
    if (!existing || !canAccessOrder(session.user, existing)) return error('Pedido no encontrado.', 404)
    if (existing.status === 'CANCELLED') throw new InputError('Un pedido cancelado no admite reparto.', 409)
    let repartidor: { id: string; name: string; branchId: string | null; role: string; permissions: unknown } | null = null
    if (assignedToId) {
      repartidor = await prisma.user.findFirst({
        where: { id: assignedToId, tenantId: tenant, status: 'ACTIVE' },
        select: { id: true, name: true, branchId: true, role: true, permissions: true },
      })
      if (!repartidor) throw new InputError('Repartidor no encontrado o inactivo.', 404)
      const permisos = effectivePermissions(repartidor.role, repartidor.permissions)
      if (!permisos.includes('*') && !permisos.includes('delivery:use')) throw new InputError('Ese usuario no tiene el rol de reparto.', 409)
      if (repartidor.branchId && existing.branchId && repartidor.branchId !== existing.branchId) throw new InputError('El repartidor pertenece a otra sucursal.', 409)
    }
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.order.findFirst({ where: { id: existing.id, tenantId: tenant }, select: { assignedToId: true } })
      if (!locked) throw new InputError('Pedido no encontrado.', 404)
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: { assignedToId, assignedAt: assignedToId ? new Date() : null },
        select: { id: true, assignedToId: true, assignedAt: true },
      })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_ASSIGNED_TO_DELIVERY', entity: 'Order', entityId: existing.id, metadata: { orderNumber: existing.orderNumber, previous: locked.assignedToId, current: assignedToId, repartidor: repartidor?.name || null, ...(note ? { note } : {}) } } })
      if (assignedToId && allowUnpaidDelivery) {
        // Saldo real del pedido al autorizar: lo confirmado más lo ya
        // pre-cobrado en la calle. La autorización se consume una sola vez.
        const pagos = await tx.payment.groupBy({ by: ['status'], where: { tenantId: tenant, orderId: existing.id, status: { in: ['CONFIRMED', 'PENDING'] } }, _sum: { amountPyg: true } })
        const confirmado = pagos.find(row => row.status === 'CONFIRMED')?._sum.amountPyg || 0
        const preCobrado = pagos.find(row => row.status === 'PENDING')?._sum.amountPyg || 0
        const { pendingPyg } = deliveryBalance(existing.totalPyg, confirmado, preCobrado)
        const authorizationId = await grantOrderDeliveryAuthorization(tx, { tenantId: tenant, orderId: existing.id, userId: assignedToId, grantedById: session.user.id, note })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DELIVERY_AUTHORIZED', entity: 'Order', entityId: existing.id, metadata: { authorizationId, pendingPyg, repartidor: repartidor?.name || null } } })
      }
      return updated
    })
    return json(result)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo asignar el reparto.', cause instanceof InputError ? cause.status : 409)
  }
}
