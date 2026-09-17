import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { canAccessOrder } from '../../../../../lib/orders'

const TIMELINE_ACTIONS = ['ORDER_FULFILLMENT_UPDATED', 'ORDER_SERIALS_ATTACHED', 'ORDER_BILLING_UPDATED', 'ORDER_DISCOUNT_APPROVED', 'ORDER_DISCOUNT_AUTHORIZED', 'ORDER_TAGS_UPDATED', 'ORDER_ARCHIVED', 'ORDER_UNARCHIVED', 'INVENTORY_UNITS_SOLD', 'ORDER_NOTIFIED_WHATSAPP']

// Cronología del pedido: pagos, cambios auditados y comentarios, más reciente
// primero. Un solo viaje para la vista de detalle.
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, select: { id: true, sellerId: true, branchId: true, createdAt: true, archivedAt: true } })
  if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
  const [audits, payments, comments] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Order', entityId: order.id, action: { in: TIMELINE_ACTIONS } },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true, avatar: { select: { updatedAt: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
    prisma.payment.findMany({
      where: { tenantId: tenant, orderId: order.id },
      select: { id: true, method: true, status: true, amountPyg: true, reference: true, paidAt: true, createdAt: true, currency: true, originalAmount: true, settlesAt: true, accountSnapshot: true, userId: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.orderComment.findMany({
      where: { tenantId: tenant, orderId: order.id },
      include: { user: { select: { id: true, name: true, avatar: { select: { updatedAt: true } } } }, photos: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
  ])
  const userIds = [...new Set(payments.map(payment => payment.userId).filter((id): id is string => Boolean(id)))]
  const pagadores = userIds.length ? await prisma.user.findMany({ where: { tenantId: tenant, id: { in: userIds } }, select: { id: true, name: true } }) : []
  const nombrePorUsuario = new Map(pagadores.map(user => [user.id, user.name]))
  const events = [
    { type: 'created', at: order.createdAt, id: `order-${order.id}` },
    ...audits.map(audit => ({ type: 'audit', at: audit.createdAt, id: audit.id, action: audit.action, metadata: audit.metadata, user: audit.user })),
    ...payments.map(payment => ({ type: 'payment', at: payment.createdAt, id: payment.id, payment, user: payment.userId && nombrePorUsuario.has(payment.userId) ? { id: payment.userId, name: nombrePorUsuario.get(payment.userId) } : null })),
    ...comments.map(comment => ({ type: 'comment', at: comment.createdAt, id: comment.id, body: comment.body, user: comment.user, photos: comment.photos })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 200)
  return json({ events })
}
