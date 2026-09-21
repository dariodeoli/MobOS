import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../../lib/payment-input'
import { validateFulfillmentTransition } from '../../../../../../lib/orders'
import { canUseDelivery, deliveryBalance } from '../../../../../../lib/delivery'
import { consumeAuthorization, usableAuthorization } from '../../../../../../lib/authorizations'

// Estado de entrega del repartidor: a entregar → en camino → entregado. Solo
// sobre sus pedidos asignados y sin saltarse las reglas de la tienda: entregar
// con saldo abierto exige crédito del cliente o una autorización de gerencia
// (la misma `ORDER_DELIVER_UNPAID` de un solo uso que concede la asignación).
//
// El saldo se mide con lo confirmado MÁS los pre-cobros que este repartidor ya
// registró: si cobró el total en la calle, no queda saldo abierto y la entrega
// procede aunque la rendición todavía no esté verificada.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canUseDelivery(session.user)) return error('No autorizado.', 403)
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some(key => key !== 'fulfillmentStatus')) throw new InputError('Campo no admitido al actualizar el reparto.')
    const existing = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant, assignedToId: session.user.id },
      select: { id: true, status: true, totalPyg: true, creditDays: true, fulfillmentStatus: true, deliveryType: true, customerId: true, orderNumber: true },
    })
    if (!existing) return error('Pedido no encontrado entre tus repartos.', 404)
    if (existing.status === 'CANCELLED') throw new InputError('Un pedido cancelado no admite cambios.', 409)
    const fulfillmentStatus = validateFulfillmentTransition(existing.fulfillmentStatus, body.fulfillmentStatus, { deliveryType: existing.deliveryType })
    let creditUpdate: { creditDays?: number; dueAt?: Date } = {}
    let deliveryAuthorization: { id: string } | null = null
    let pendingDeliveryPyg = 0
    if (fulfillmentStatus === 'DELIVERED' && existing.fulfillmentStatus !== 'DELIVERED') {
      const pagos = await prisma.payment.groupBy({
        by: ['status'],
        where: { tenantId: tenant, orderId: existing.id, status: { in: ['CONFIRMED', 'PENDING'] } },
        _sum: { amountPyg: true },
      })
      const confirmado = pagos.find(row => row.status === 'CONFIRMED')?._sum.amountPyg || 0
      const preCobrado = pagos.find(row => row.status === 'PENDING')?._sum.amountPyg || 0
      pendingDeliveryPyg = deliveryBalance(existing.totalPyg, confirmado, preCobrado).pendingPyg
      if (pendingDeliveryPyg > 0) {
        const cliente = existing.customerId
          ? await prisma.customer.findFirst({ where: { id: existing.customerId, tenantId: tenant }, select: { creditLimitPyg: true, creditDays: true } })
          : null
        const credito = cliente && Number(cliente.creditLimitPyg || 0) > 0 && Number(cliente.creditDays || 0) > 0 ? Number(cliente.creditDays) : null
        if (credito) {
          if (!existing.creditDays) creditUpdate = { creditDays: credito, dueAt: new Date(Date.now() + credito * 86400000) }
        } else {
          const authorization = await prisma.customerAuthorization.findFirst({
            where: { tenantId: tenant, kind: 'ORDER_DELIVER_UNPAID', entity: 'ORDER', entityId: existing.id, status: 'APPROVED', requestedById: session.user.id, usedAt: null },
            orderBy: { resolvedAt: 'desc' },
          })
          const valid = usableAuthorization(authorization, { userId: session.user.id, kinds: ['ORDER_DELIVER_UNPAID'], label: 'entrega' })
          deliveryAuthorization = { id: valid.id }
        }
      }
    }
    const order = await prisma.$transaction(async tx => {
      const updated = await tx.order.update({ where: { id: existing.id }, data: { fulfillmentStatus, ...creditUpdate }, select: { id: true, orderNumber: true, fulfillmentStatus: true, status: true, totalPyg: true, assignedToId: true, assignedAt: true } })
      if (deliveryAuthorization) {
        await consumeAuthorization(tx, { id: deliveryAuthorization.id, tenantId: tenant, kinds: ['ORDER_DELIVER_UNPAID'], userId: session.user.id, label: 'entrega', usedByOrderId: existing.id })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DELIVERED_UNPAID', entity: 'Order', entityId: existing.id, metadata: { authorizationId: deliveryAuthorization.id, pendingPyg: pendingDeliveryPyg, reparto: true } } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_FULFILLMENT_UPDATED', entity: 'Order', entityId: existing.id, metadata: { previous: existing.fulfillmentStatus, current: fulfillmentStatus, reparto: true, ...(deliveryAuthorization ? { authorizationId: deliveryAuthorization.id, pendingPyg: pendingDeliveryPyg } : {}) } } })
      return updated
    })
    return json(order)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el reparto.', cause instanceof InputError ? cause.status : 409)
  }
}
