import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { findAccessiblePayment, normalizeReconciliationNote, RECONCILIATION_ROLES } from '../../_lib'

type RouteContext = { params: { paymentId: string } }

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)

  const reconciliation = await prisma.paymentReconciliation.findUnique({
    where: { paymentId: payment.id },
    select: { id: true, paymentId: true, state: true, note: true, createdAt: true, updatedAt: true, verifiedBy: { select: { id: true, name: true, role: true } } },
  })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_RECONCILIATION_VIEWED', entity: 'Payment', entityId: payment.id, metadata: { state: reconciliation?.state ?? 'PENDING' } } })
  return json(reconciliation ?? { paymentId: payment.id, state: 'PENDING', note: null, verifiedBy: null, createdAt: null, updatedAt: null })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!RECONCILIATION_ROLES.includes(session.user.role as (typeof RECONCILIATION_ROLES)[number])) return error('No autorizado para conciliar pagos.', 403)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)

  let body: { state?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return error('JSON inválido.')
  }
  if (body.state !== 'VERIFIED' && body.state !== 'REJECTED') return error('state debe ser VERIFIED o REJECTED.')

  let note: string | null
  try {
    note = normalizeReconciliationNote(body.note)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'note inválida.')
  }

  const reconciliation = await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string; orderId: string; status: string; amountPyg: number; method: string; deliveryUserId: string | null; deliverySettlementId: string | null }>>`
      SELECT "id", "orderId", "status"::text AS "status", "amountPyg", "method"::text AS "method", "deliveryUserId", "deliverySettlementId" FROM "Payment"
      WHERE "id" = ${payment.id} AND "tenantId" = ${session.user.tenantId} FOR UPDATE`
    const row = locked[0]
    if (!row) return null
    const result = await tx.paymentReconciliation.upsert({
      where: { paymentId: payment.id },
      create: { tenantId: session.user.tenantId, paymentId: payment.id, state: body.state as 'VERIFIED' | 'REJECTED', note, verifiedById: session.user.id },
      update: { state: body.state as 'VERIFIED' | 'REJECTED', note, verifiedById: session.user.id },
      select: { id: true, paymentId: true, state: true, note: true, createdAt: true, updatedAt: true, verifiedBy: { select: { id: true, name: true, role: true } } },
    })
    // Conciliar un pago que seguía pendiente lo confirma (o lo rechaza) de
    // verdad: antes la conciliación era solo un estado paralelo y el cobro
    // pendiente no bajaba nunca de la deuda. El cobro de calle del repartidor
    // queda afuera: su ciclo es la rendición, no esta pantalla.
    if (row.status === 'PENDING' && !row.deliveryUserId && !row.deliverySettlementId) {
      const nextStatus = body.state === 'VERIFIED' ? 'CONFIRMED' : 'REJECTED'
      await tx.payment.update({ where: { id: row.id }, data: { status: nextStatus, ...(nextStatus === 'CONFIRMED' ? { paidAt: new Date() } : {}) } })
      if (nextStatus === 'CONFIRMED') {
        const pedidos = await tx.$queryRaw<Array<{ id: string; status: string; totalPyg: number }>>`
          SELECT "id", "status"::text AS "status", "totalPyg" FROM "Order"
          WHERE "id" = ${row.orderId} AND "tenantId" = ${session.user.tenantId} FOR UPDATE`
        const order = pedidos[0]
        if (order && order.status !== 'CANCELLED') {
          const paid = await tx.payment.aggregate({ where: { orderId: order.id, tenantId: session.user.tenantId, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
          if ((paid._sum.amountPyg || 0) >= order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
        }
      }
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: nextStatus === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED', entity: 'Payment', entityId: row.id, metadata: { orderId: row.orderId, amountPyg: row.amountPyg, method: row.method, note } } })
    }
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_RECONCILIATION_UPDATED', entity: 'PaymentReconciliation', entityId: result.id, metadata: { paymentId: payment.id, state: result.state, note } } })
    return result
  })
  if (!reconciliation) return error('Pago no encontrado.', 404)
  return json(reconciliation)
}
