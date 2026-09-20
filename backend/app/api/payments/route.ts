import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError, matchesPayment, normalizePayment, objectInput, receiveTradeIn, textInput } from '../../../lib/payment-input'
import { enforceRateLimit } from '../../../lib/rate-limit'

const INT_MAX = 2147483647
class PaymentScopeError extends Error {
  readonly status = 403
}

// Consume saldo a favor del cliente (FIFO por antigüedad) y registra cada uso
// contra el pedido y el cobro. Si no alcanza, la transacción entera revierte.
async function consumeStoreCredit(tx: Prisma.TransactionClient, input: {
  tenantId: string; customerId: string | null; orderId: string; paymentId: string; userId: string; amountPyg: number; method: string
}) {
  if (input.method !== 'STORE_CREDIT') return
  if (!input.customerId) throw new InputError('El saldo a favor necesita un cliente identificado en la venta.', 409)
  const credits = await tx.$queryRaw<Array<{ id: string; remainingPyg: number }>>`
    SELECT "id", "remainingPyg" FROM "StoreCredit"
    WHERE "tenantId" = ${input.tenantId} AND "customerId" = ${input.customerId} AND "remainingPyg" > 0
    ORDER BY "createdAt" ASC FOR UPDATE`
  const available = credits.reduce((sum, credit) => sum + credit.remainingPyg, 0)
  if (available < input.amountPyg) throw new InputError('El cliente no tiene saldo a favor suficiente.', 409)
  let left = input.amountPyg
  for (const credit of credits) {
    if (left <= 0) break
    const take = Math.min(credit.remainingPyg, left)
    await tx.storeCredit.update({ where: { id: credit.id }, data: { remainingPyg: { decrement: take } } })
    await tx.storeCreditUse.create({ data: { tenantId: input.tenantId, creditId: credit.id, orderId: input.orderId, paymentId: input.paymentId, amountPyg: take, createdById: input.userId } })
    left -= take
  }
  await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.userId, action: 'STORE_CREDIT_USED', entity: 'Order', entityId: input.orderId, metadata: { paymentId: input.paymentId, amountPyg: input.amountPyg } } })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  // El repartidor no registra pagos confirmados: su cobro de calle nace
  // PENDING y pasa por la rendición (/api/delivery/orders/[id]/collections).
  if (session.user.role === 'REPARTIDOR') return error('El cobro de la calle se registra desde el panel de reparto.', 403)
  if (!canAccessAny(session.user, ['payments:manage', 'orders:manage', 'orders:own', 'orders:branch'])) return error('Tu rol no puede registrar cobros.', 403)
  const limited = enforceRateLimit(request, 'payments', 120, 60_000)
  if (limited) return limited
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  if (idempotencyKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Identificador de operación inválido.')
  try {
    const body = objectInput(await request.json())
    const orderId = textInput(body.orderId, 'orderId', 200)
    // Cuota concreta del plan de crédito que este cobro viene a saldar. Al
    // indicarla, el pago se concilia sobre la cuota existente en vez de crear
    // otro movimiento: la deuda no se duplica y el recordatorio se detiene.
    const installmentId = body.installmentId === undefined || body.installmentId === null || body.installmentId === '' ? null : textInput(body.installmentId, 'installmentId', 200)
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string; branchId: string | null; sellerId: string; status: string; totalPyg: number; orderNumber: string; customerId: string | null }>>`SELECT "id", "branchId", "sellerId", "status", "totalPyg", "orderNumber", "customerId" FROM "Order" WHERE "id" = ${orderId} AND "tenantId" = ${tenant} FOR UPDATE`
      const order = locked[0]
      if (!order) throw new Error('Venta no encontrada.')
      if (session.user.role === 'VENDEDOR' && order.sellerId !== session.user.id) throw new PaymentScopeError('La venta pertenece a otro vendedor.')
      if ((session.user.branchId === null && order.branchId !== null) || (session.user.branchId && order.branchId !== null && order.branchId !== session.user.branchId)) throw new Error('La venta pertenece a otra sucursal.')
      if (idempotencyKey) {
        const previous = await tx.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } } })
        if (previous) {
          const normalized = await normalizePayment(tx, tenant, body, previous).catch(() => { throw new InputError('El identificador ya pertenece a otro pago.', 409) })
          // Reintento del cobro de una cuota: la cuota ya quedó saldada por el
          // primer intento, así que el reintento devuelve ese mismo movimiento
          // (la cuota conserva su vencimiento) en vez de duplicar el cobro.
          const replayCuota = installmentId !== null && previous.id === installmentId && previous.orderId === order.id
          if (replayCuota) {
            if (previous.status !== 'CONFIRMED' || !previous.dueAt || normalized.status !== 'CONFIRMED' || previous.method !== normalized.method || previous.amountPyg !== normalized.amountPyg) throw new Error('El identificador ya pertenece a otro pago.')
          } else if (!matchesPayment(previous, normalized, order.id)) throw new Error('El identificador ya pertenece a otro pago.')
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
      // Cobro de una cuota del plan de crédito: se salda la cuota misma (mismo
      // movimiento), se confirma con el medio real del cobro, se cierra el
      // pedido si quedó pagado y el recordatorio se detiene. Bajo el FOR UPDATE
      // del pedido y de la cuota, un reintento no descuenta dos veces.
      if (installmentId) {
        if (status !== 'CONFIRMED') throw new InputError('Una cuota se cobra como pago confirmado.')
        const rows = await tx.$queryRaw<Array<{ id: string; status: string; amountPyg: number; dueAt: Date | null; reference: string | null }>>`
          SELECT "id", "status"::text AS "status", "amountPyg", "dueAt", "reference" FROM "Payment"
          WHERE "id" = ${installmentId} AND "tenantId" = ${tenant} AND "orderId" = ${order.id} FOR UPDATE`
        const cuota = rows[0]
        if (!cuota?.dueAt) throw new InputError('La cuota indicada no pertenece a esta venta.', 404)
        if (cuota.status !== 'PENDING') throw new InputError('Esa cuota ya fue cobrada o no está pendiente.', 409)
        if (amount !== cuota.amountPyg) throw new InputError(`El monto debe ser exactamente el de la cuota (${cuota.amountPyg} Gs.).`)
        const cobrado = await tx.payment.aggregate({ where: { orderId: order.id, tenantId: tenant, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
        const yaCobrado = cobrado._sum.amountPyg || 0
        if (!Number.isSafeInteger(order.totalPyg) || order.totalPyg < 0 || order.totalPyg > INT_MAX || !Number.isSafeInteger(yaCobrado + amount) || yaCobrado + amount > INT_MAX || yaCobrado + amount > order.totalPyg) throw new Error('El pago supera el total de la venta.')
        const payment = await tx.payment.update({ where: { id: cuota.id }, data: { ...normalized, reference: normalized.reference ?? cuota.reference, idempotencyKey, userId: session.user.id, createdById: session.user.id, paidAt: new Date() } })
        await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
        await consumeStoreCredit(tx, { tenantId: tenant, customerId: order.customerId, orderId: order.id, paymentId: payment.id, userId: session.user.id, amountPyg: payment.amountPyg, method: normalized.method })
        if (yaCobrado + amount >= order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CREDIT_INSTALLMENT_PAID', entity: 'Payment', entityId: payment.id, metadata: { orderId: order.id, orderNumber: order.orderNumber, amountPyg: payment.amountPyg, method: payment.method, dueAt: cuota.dueAt, installment: true } } })
        return payment
      }
      const paid = await tx.payment.aggregate({ where: { orderId: order.id, tenantId: tenant, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
      const confirmed = paid._sum.amountPyg || 0
      if (!Number.isSafeInteger(order.totalPyg) || order.totalPyg < 0 || order.totalPyg > INT_MAX || (status === 'CONFIRMED' && (!Number.isSafeInteger(confirmed + amount) || confirmed + amount > INT_MAX || confirmed + amount > order.totalPyg))) throw new Error('El pago supera el total de la venta.')
      const payment = await tx.payment.create({ data: { ...normalized, tenantId: tenant, orderId: order.id, idempotencyKey, createdById: session.user.id, userId: session.user.id } })
      await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
      await consumeStoreCredit(tx, { tenantId: tenant, customerId: order.customerId, orderId: order.id, paymentId: payment.id, userId: session.user.id, amountPyg: payment.amountPyg, method: normalized.method })
      if (status === 'CONFIRMED' && confirmed + amount === order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PAYMENT_RECORDED', entity: 'Payment', entityId: payment.id, metadata: { orderId: order.id, orderNumber: order.orderNumber, amountPyg: amount, status: normalized.status, method: normalized.method } } })
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

// Cuotas por cobrar: pagos PENDING con vencimiento (plan de crédito) de la
// empresa, ordenados por fecha de vencimiento. Incluye cliente y pedido para
// el aviso por WhatsApp. Roles: ADMIN, GERENTE y CAJERA.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'CAJERA'].includes(session.user.role)) return error('No autorizado.', 403)
  const overdue = new URL(request.url).searchParams.get('overdue') === 'true'
  const local = new Date(Date.now() - 180 * 60000)
  const finDelDia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999))
  const rows = await prisma.payment.findMany({
    where: { tenantId: tenant, status: 'PENDING', dueAt: { not: null }, ...(overdue ? { dueAt: { lte: finDelDia } } : {}) },
    include: { order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true, phone: true, countryCode: true } } } } },
    orderBy: { dueAt: 'asc' },
    take: 200,
  })
  return json(rows)
}
