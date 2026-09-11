import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, matchesPayment, normalizePayment, objectInput, receiveTradeIn, textInput } from '../../../lib/payment-input'

const INT_MAX = 2147483647
class PaymentScopeError extends Error {
  readonly status = 403
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  if (idempotencyKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Identificador de operación inválido.')
  try {
    const body = objectInput(await request.json())
    const orderId = textInput(body.orderId, 'orderId', 200)
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string; branchId: string | null; sellerId: string; status: string; totalPyg: number }>>`SELECT "id", "branchId", "sellerId", "status", "totalPyg" FROM "Order" WHERE "id" = ${orderId} AND "tenantId" = ${tenant} FOR UPDATE`
      const order = locked[0]
      if (!order) throw new Error('Venta no encontrada.')
      if (session.user.role === 'VENDEDOR' && order.sellerId !== session.user.id) throw new PaymentScopeError('La venta pertenece a otro vendedor.')
      if ((session.user.branchId === null && order.branchId !== null) || (session.user.branchId && order.branchId !== null && order.branchId !== session.user.branchId)) throw new Error('La venta pertenece a otra sucursal.')
      if (idempotencyKey) {
        const previous = await tx.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } } })
        if (previous) {
          const normalized = await normalizePayment(tx, tenant, body, previous).catch(() => { throw new InputError('El identificador ya pertenece a otro pago.', 409) })
          if (!matchesPayment(previous, normalized, order.id)) throw new Error('El identificador ya pertenece a otro pago.')
          if (normalized.tradeIn) {
            const device = await tx.tradeInDevice.findUnique({ where: { paymentId: previous.id } })
            if (!device || device.serial !== normalized.tradeIn.serial || device.model !== normalized.tradeIn.model || device.conditionNotes !== normalized.tradeIn.conditionNotes) throw new Error('El identificador ya pertenece a otra recepción.')
          }
          return previous
        }
      }
      if (order.status === 'CANCELLED' || order.status === 'COMPLETED') throw new Error('La venta no admite nuevos pagos.')
      const { tradeIn, ...normalized } = await normalizePayment(tx, tenant, body)
      const amount = normalized.amountPyg; const status = normalized.status
      const paid = await tx.payment.aggregate({ where: { orderId: order.id, tenantId: tenant, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
      const confirmed = paid._sum.amountPyg || 0
      if (!Number.isSafeInteger(order.totalPyg) || order.totalPyg < 0 || order.totalPyg > INT_MAX || (status === 'CONFIRMED' && (!Number.isSafeInteger(confirmed + amount) || confirmed + amount > INT_MAX || confirmed + amount > order.totalPyg))) throw new Error('El pago supera el total de la venta.')
      const payment = await tx.payment.create({ data: { ...normalized, tenantId: tenant, orderId: order.id, idempotencyKey } })
      await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
      if (status === 'CONFIRMED' && confirmed + amount === order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
      return payment
    })
    return json(result, { status: 201 })
  } catch (e) {
    if (e instanceof PaymentScopeError) return error(e.message, e.status)
    if (e instanceof InputError) return error(e.message, e.status)
    if (e instanceof SyntaxError) return error('JSON inválido.')
    return error(e instanceof Error ? e.message : 'No se pudo registrar el pago.', 409)
  }
}
