import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../lib/payment-input'
import { canAccessOrder, canProcessOrderReturn, returnRequest } from '../../../../../lib/orders'

// La devolución financiera se conserva en la orden original. La reposición de
// stock es deliberadamente otro flujo: no se asume que un equipo devuelto sea
// apto para volver a venderse.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canProcessOrderReturn(session.user)) return error('Tu rol no puede registrar devoluciones o cambios.', 403)
  try {
    const { orderId } = await context.params
    const requestData = returnRequest(objectInput(await request.json()))
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: { payments: true } })
      if (!order || !canAccessOrder(session.user, order)) throw new InputError('Pedido no encontrado.', 404)
      if (order.status === 'CANCELLED') throw new InputError('Este pedido ya fue devuelto o cancelado.', 409)
      let replacementOrderId = requestData.replacementOrderId
      if (!replacementOrderId && requestData.replacementOrderNumber) {
        const replacement = await tx.order.findFirst({ where: { tenantId: tenant, orderNumber: requestData.replacementOrderNumber }, select: { id: true } })
        if (!replacement) throw new InputError('El número de pedido de cambio no pertenece a esta empresa.', 404)
        replacementOrderId = replacement.id
      }
      if (replacementOrderId) {
        const replacement = await tx.order.findFirst({ where: { id: replacementOrderId, tenantId: tenant }, select: { id: true } })
        if (!replacement) throw new InputError('El pedido de cambio no pertenece a esta empresa.', 404)
      }
      const confirmed = order.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountPyg, 0)
      const refundPyg = requestData.refundPyg ?? (requestData.operation === 'RETURN' ? confirmed : 0)
      if (refundPyg !== 0 && refundPyg !== confirmed) throw new InputError('Por ahora la devolución financiera debe coincidir con el total cobrado. Registrá el ajuste parcial desde Caja.', 409)
      const isFullReturn = requestData.operation === 'RETURN' && refundPyg === confirmed
      if (isFullReturn) {
        await tx.payment.updateMany({ where: { orderId: order.id, tenantId: tenant, status: 'CONFIRMED' }, data: { status: 'REFUNDED' } })
        await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
      }
      const action = requestData.operation === 'RETURN' ? 'ORDER_RETURN_RECORDED' : 'ORDER_EXCHANGE_RECORDED'
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action, entity: 'Order', entityId: order.id, metadata: { reason: requestData.reason, refundPyg, replacementOrderId: requestData.replacementOrderId ?? null, financialStatus: isFullReturn ? 'REFUNDED' : 'NO_FINANCIAL_CHANGE', stockAction: 'REVIEW_REQUIRED' } } })
      return { id: order.id, operation: requestData.operation, refundedPyg: refundPyg, status: isFullReturn ? 'CANCELLED' : order.status }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar la postventa.', cause instanceof InputError ? cause.status : 400) }
}
