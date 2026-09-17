import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

// Cronología del cliente: alta, pedidos, cobros, cambios de datos, notas y
// garantías, con la persona real que hizo cada cosa. Paginada (más reciente
// primero) para clientes con años de historial.
export async function GET(request: Request, context: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const customerId = (id || '').trim().slice(0, 128)
  if (!customerId) return error('Cliente obligatorio.')
  const query = new URL(request.url).searchParams
  const take = Math.min(100, Math.max(1, Number(query.get('limit')) || 30))
  const skip = Math.max(0, Number(query.get('offset')) || 0)

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
    select: { id: true, name: true, createdAt: true },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  const orders = await prisma.order.findMany({
    where: { tenantId: session.user.tenantId, customerId: customer.id },
    select: {
      id: true, orderNumber: true, totalPyg: true, status: true, createdAt: true,
      payments: { select: { id: true, amountPyg: true, method: true, status: true, paidAt: true, createdAt: true, userId: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const orderIds = orders.map(order => order.id)
  const [audits, notes, warranties] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        tenantId: session.user.tenantId,
        OR: [
          { entity: 'Customer', entityId: customer.id },
          ...(orderIds.length ? [{ entity: 'Order' as const, entityId: { in: orderIds }, action: 'ORDER_FULFILLMENT_UPDATED' }] : []),
        ],
      },
      select: { id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true, user: { select: { id: true, name: true, avatar: { select: { updatedAt: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.customerNote.findMany({
      where: { customerId: customer.id, tenantId: session.user.tenantId },
      select: { id: true, content: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    orderIds.length
      ? prisma.warrantyCase.findMany({
          where: { tenantId: session.user.tenantId, orderItem: { orderId: { in: orderIds } } },
          select: { id: true, status: true, warrantyDays: true, expiresAt: true, createdAt: true, serial: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
  ])

  const userIds = [...new Set([
    ...audits.map(audit => audit.user?.id),
    ...notes.map(note => note.userId),
    ...orders.flatMap(order => order.payments.map(payment => payment.userId)),
  ].filter((value): value is string => Boolean(value)))]
  const usuarios = userIds.length
    ? await prisma.user.findMany({ where: { tenantId: session.user.tenantId, id: { in: userIds } }, select: { id: true, name: true, avatar: { select: { updatedAt: true } } } })
    : []
  const nombrePorUsuario = new Map(usuarios.map(user => [user.id, user.name]))
  const conFotoPorUsuario = new Map(usuarios.map(user => [user.id, Boolean(user.avatar)]))
  const orderNumberPorId = new Map(orders.map(order => [order.id, order.orderNumber]))

  const events = [
    { type: 'created', at: customer.createdAt, id: `customer-${customer.id}`, actor: null, detail: 'Cliente creado' },
    ...orders.map(order => ({
      type: 'order', at: order.createdAt, id: `order-${order.id}`, actor: null,
      detail: `Pedido ${order.orderNumber || ''}`.trim(), amountPyg: order.totalPyg, orderNumber: order.orderNumber,
    })),
    ...orders.flatMap(order => order.payments.filter(payment => payment.status === 'CONFIRMED').map(payment => ({
      type: 'payment', at: payment.paidAt || payment.createdAt, id: `payment-${payment.id}`,
      actor: payment.userId ? nombrePorUsuario.get(payment.userId) || null : null, actorId: payment.userId || null,
      detail: 'Pago recibido', amountPyg: payment.amountPyg, method: payment.method, orderNumber: order.orderNumber,
    }))),
    ...audits.map(audit => ({
      type: 'audit', at: audit.createdAt, id: audit.id, actor: audit.user?.name || null, actorId: audit.user?.id || null,
      action: audit.action, metadata: audit.metadata,
      orderNumber: audit.entity === 'Order' ? orderNumberPorId.get(audit.entityId || '') || null : null,
    })),
    ...notes.map(note => ({ type: 'note', at: note.createdAt, id: `note-${note.id}`, actor: note.userId ? nombrePorUsuario.get(note.userId) || null : null, actorId: note.userId || null, detail: note.content })),
    ...warranties.map(warranty => ({ type: 'warranty', at: warranty.createdAt, id: `warranty-${warranty.id}`, actor: null, detail: `Garantía de ${warranty.warrantyDays || 0} días`, serial: warranty.serial })),
  ].map(evento => 'actorId' in evento && evento.actorId ? { ...evento, actorHasAvatar: conFotoPorUsuario.get(evento.actorId) === true } : evento)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return json({
    customer: { id: customer.id, name: customer.name, createdAt: customer.createdAt },
    total: events.length,
    events: events.slice(skip, skip + take),
  })
}
