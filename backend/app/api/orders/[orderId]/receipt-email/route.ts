import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { canAccessOrder } from '../../../../../lib/orders'
import { enqueueEmail, pendingEmailForAggregate } from '../../../../../lib/email-outbox'
import { receiptEmail } from '../../../../../lib/email'

// Encola el comprobante del pedido al correo del cliente. Correo transaccional:
// no requiere consentimiento de marketing, solo que el cliente tenga email.
export async function POST(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const session = await requireSession(_request)
  if (!session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: session.user.tenantId },
      include: { items: true, customer: { select: { id: true, name: true, email: true } } },
    })
    if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
    const email = order.customer?.email
    if (!email) return error('Este cliente no tiene correo cargado. Completalo en su ficha para enviar el comprobante.', 409)

    const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { name: true } })
    const trackingUrl = `${process.env.MOBOS_APP_URL || 'https://app.moboss.online'}/api/orders/public/${order.publicToken}`
    const message = receiptEmail({
      to: email,
      customerName: order.customer?.name ?? '',
      orderNumber: order.orderNumber,
      lines: order.items.map((item) => ({ quantity: item.quantity, description: item.description, totalPyg: item.totalPyg })),
      totalPyg: order.totalPyg,
      trackingUrl,
      companyName: tenant?.name ?? 'MobOS',
    })
    if (!message) return error('No se pudo preparar el comprobante.', 500)

    const resultado = await prisma.$transaction(async tx => {
      if (await pendingEmailForAggregate(tx, 'Order', order.id)) return { already: true }
      await enqueueEmail(tx, { tenantId: session.user.tenantId, kind: 'receipt', aggregateType: 'Order', aggregateId: order.id, message })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'RECEIPT_EMAIL_QUEUED', entity: 'Order', entityId: order.id, metadata: { orderNumber: order.orderNumber } } })
      return { already: false }
    })
    return json(resultado.already ? { already: true } : { queued: true })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo encolar el comprobante.', 500)
  }
}
