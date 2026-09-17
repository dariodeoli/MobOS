import { prisma } from '../../../../../lib/prisma'
import { internationalPhone } from '../../../../../lib/validation'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { canAccessOrder } from '../../../../../lib/orders'

// Plantilla sugerida según el estado de entrega del pedido.
const TEMPLATE_BY_STATUS: Record<string, string> = {
  IN_TRANSIT: 'arrived_from_depot',
  READY_FOR_PICKUP: 'ready_for_pickup',
}

function render(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => variables[key] ?? '')
}

// Mensaje de WhatsApp listo para enviar al cliente según el estado del pedido,
// usando la plantilla configurada por la tienda (con enlace de seguimiento).
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: {
    customer: { select: { name: true, phone: true, countryCode: true } },
    branch: { select: { name: true } },
  } })
  if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
  const key = TEMPLATE_BY_STATUS[order.fulfillmentStatus]
  if (!key) return error('Este estado no tiene aviso automático configurado.', 409)
  if (!order.customer?.phone) return error('El cliente no tiene teléfono cargado.', 409)
  const template = await prisma.messageTemplate.findUnique({ where: { tenantId_key: { tenantId: tenant, key } } })
  const trackingUrl = order.publicToken ? `${process.env.MOBOS_APP_URL || 'https://app.moboss.online'}/pedido/${order.publicToken}` : ''
  const variables: Record<string, string> = {
    customer_name: order.customer.name || 'cliente',
    order_number: order.orderNumber || '',
    branch_name: order.branch?.name || 'la tienda',
    reservation_until: '',
    tracking_url: trackingUrl,
  }
  const body = template?.isActive === false ? '' : (template?.body || 'Hola, {{customer_name}}. Tu pedido {{order_number}} cambió de estado.')
  const message = `${render(body, variables)}${trackingUrl && !body.includes('{{tracking_url}}') ? `\n${trackingUrl}` : ''}`.trim()
  const phone = internationalPhone(order.customer.phone, order.customer.countryCode)
  return json({ templateKey: key, message, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, phone, notifiedAt: order.notifiedAt })
}
