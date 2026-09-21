import { prisma } from '../../../../../lib/prisma'
import { internationalPhone } from '../../../../../lib/validation'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { canAccessOrder } from '../../../../../lib/orders'

// Plantilla sugerida según el estado de entrega del pedido.
const TEMPLATE_BY_STATUS: Record<string, string> = {
  IN_TRANSIT: 'arrived_from_depot',
  READY_TO_SHIP: 'ready_to_ship',
  READY_FOR_PICKUP: 'ready_for_pickup',
}

function render(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => variables[key] ?? '')
}

const importe = (value: number) => `Gs. ${Math.round(Math.max(0, value)).toLocaleString('es-PY')}`

type OrderForMessage = {
  orderNumber: string | null
  totalPyg: number
  publicToken: string | null
  accessTokens: Array<{ token: string }>
  fulfillmentStatus: string
  createdAt: Date
  customer: { name: string | null; phone: string | null; countryCode: string | null } | null
  branch: { name: string } | null
  seller: { name: string } | null
  payments: Array<{ amountPyg: number }>
}

// Variables del contexto ORDERS compartidas por el aviso automático y el envío
// con plantilla elegida. Los alias viejos siguen funcionando.
function variablesDe(order: OrderForMessage) {
  const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amountPyg || 0), 0)
  const pending = Math.max(0, Number(order.totalPyg || 0) - paid)
  const cliente = order.customer?.name || 'cliente'
  const sucursal = order.branch?.name || 'la tienda'
  return {
    cliente,
    nombre: cliente,
    customer_name: cliente,
    pedido: order.orderNumber || '',
    order_number: order.orderNumber || '',
    total: importe(Number(order.totalPyg || 0)),
    saldo_pendiente: importe(pending),
    sucursal,
    branch_name: sucursal,
    vendedor: order.seller?.name || '',
    fecha: order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-PY') : '',
    reservation_until: '',
  }
}

const orderInclude = {
  customer: { select: { name: true, phone: true, countryCode: true } },
  branch: { select: { name: true } },
  seller: { select: { name: true } },
  payments: { where: { status: 'CONFIRMED' as const }, select: { amountPyg: true } },
  // #178: el pedido nuevo no guarda su token histórico en claro; el enlace de
  // seguimiento del mensaje sale del enlace vigente de nivel rápido.
  accessTokens: { where: { revokedAt: null, level: 'rapido' }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { token: true } },
}

function buildPayload(order: OrderForMessage, template: { body: string; isActive: boolean } | null, fallback: string) {
  const tokenSeguimiento = order.publicToken || order.accessTokens[0]?.token || ''
  const trackingUrl = tokenSeguimiento ? `${process.env.MOBOS_APP_URL || 'https://app.moboss.online'}/pedido/${tokenSeguimiento}` : ''
  const variables = { ...variablesDe(order), tracking_url: trackingUrl }
  const body = template?.isActive === false ? '' : (template?.body || fallback)
  const message = `${render(body, variables)}${trackingUrl && !body.includes('{{tracking_url}}') ? `\n${trackingUrl}` : ''}`.trim()
  const phone = internationalPhone(order.customer?.phone, order.customer?.countryCode)
  return { message, phone, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` }
}

// Mensaje de WhatsApp listo para enviar al cliente según el estado del pedido,
// usando la plantilla configurada por la tienda (con enlace de seguimiento).
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: orderInclude })
  if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
  const key = TEMPLATE_BY_STATUS[order.fulfillmentStatus]
  if (!key) return error('Este estado no tiene aviso automático configurado.', 409)
  if (!order.customer?.phone) return error('El cliente no tiene teléfono cargado.', 409)
  const template = await prisma.messageTemplate.findUnique({ where: { tenantId_key: { tenantId: tenant, key } } })
  const payload = buildPayload(order, template, 'Hola, {{customer_name}}. Tu pedido {{order_number}} cambió de estado.')
  return json({ templateKey: key, ...payload, notifiedAt: order.notifiedAt })
}

// Envío con una plantilla ORDERS elegida en la app. Además de armar el mensaje
// server-side, marca el pedido como avisado (notifiedAt) con auditoría.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const templateKey = typeof body.templateKey === 'string' ? body.templateKey.trim() : ''
  if (!templateKey) return error('Elegí una plantilla de WhatsApp.')
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: orderInclude })
  if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
  if (!order.customer?.phone) return error('El cliente no tiene teléfono cargado.', 409)
  const template = await prisma.messageTemplate.findUnique({ where: { tenantId_key: { tenantId: tenant, key: templateKey } } })
  if (!template || template.category !== 'ORDERS') return error('Plantilla de pedidos no encontrada.', 404)
  const notifiedAt = await prisma.$transaction(async tx => {
    const updated = await tx.order.update({ where: { id: order.id }, data: { notifiedAt: new Date() }, select: { notifiedAt: true } })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_NOTIFIED_WHATSAPP', entity: 'Order', entityId: order.id, metadata: { fulfillmentStatus: order.fulfillmentStatus, templateKey } } })
    return updated.notifiedAt
  })
  const payload = buildPayload(order, template, 'Hola, {{customer_name}}. Tu pedido {{order_number}} cambió de estado.')
  return json({ templateKey, ...payload, notifiedAt })
}
