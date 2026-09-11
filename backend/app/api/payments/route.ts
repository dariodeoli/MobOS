import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const methods = ['CASH', 'TRANSFER', 'CARD', 'CREDIT'] as const
const statuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'REFUNDED'] as const
const INT_MAX = 2147483647
class PaymentScopeError extends Error {
  readonly status = 403
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const body = await request.json(); const amount = Number(body.amountPyg); const status = body.status || 'CONFIRMED'
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  if (idempotencyKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Identificador de operación inválido.')
  if (!body.orderId || !Number.isSafeInteger(amount) || amount <= 0 || amount > INT_MAX || !methods.includes(body.method) || !statuses.includes(status)) return error('Venta, monto entero positivo, método y estado válido son obligatorios.')
  try {
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string; branchId: string | null; sellerId: string; status: string; totalPyg: number }>>`SELECT "id", "branchId", "sellerId", "status", "totalPyg" FROM "Order" WHERE "id" = ${body.orderId} AND "tenantId" = ${tenant} FOR UPDATE`
      const order = locked[0]
      if (!order) throw new Error('Venta no encontrada.')
      if (session.user.role === 'VENDEDOR' && order.sellerId !== session.user.id) throw new PaymentScopeError('La venta pertenece a otro vendedor.')
      if ((session.user.branchId === null && order.branchId !== null) || (session.user.branchId && order.branchId !== null && order.branchId !== session.user.branchId)) throw new Error('La venta pertenece a otra sucursal.')
      if (idempotencyKey) {
        const previous = await tx.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } } })
        if (previous) {
          if (previous.orderId !== order.id || previous.amountPyg !== amount || previous.method !== body.method || previous.status !== status || (previous.reference || '') !== (body.reference || '')) throw new Error('El identificador ya pertenece a otro pago.')
          return previous
        }
      }
      if (order.status === 'CANCELLED' || order.status === 'COMPLETED') throw new Error('La venta no admite nuevos pagos.')
      const paid = await tx.payment.aggregate({ where: { orderId: order.id, tenantId: tenant, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
      const confirmed = paid._sum.amountPyg || 0
      if (!Number.isSafeInteger(order.totalPyg) || order.totalPyg < 0 || order.totalPyg > INT_MAX || (status === 'CONFIRMED' && (!Number.isSafeInteger(confirmed + amount) || confirmed + amount > INT_MAX || confirmed + amount > order.totalPyg))) throw new Error('El pago supera el total de la venta.')
      const payment = await tx.payment.create({ data: { tenantId: tenant, orderId: order.id, method: body.method, amountPyg: amount, status, reference: body.reference, idempotencyKey } })
      if (status === 'CONFIRMED' && confirmed + amount === order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
      return payment
    })
    return json(result, { status: 201 })
  } catch (e) {
    if (e instanceof PaymentScopeError) return error(e.message, e.status)
    return error(e instanceof Error ? e.message : 'No se pudo registrar el pago.', 409)
  }
}
