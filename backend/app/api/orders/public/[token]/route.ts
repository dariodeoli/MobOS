import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

// Vista pública mínima: el token opaco es el único identificador compartible.
// Nunca expone pagos, costos, IMEI, teléfonos, direcciones ni datos internos.
// Incluye los tokens públicos de las garantías vinculadas a este pedido para
// que el cliente pueda ver cobertura y días restantes desde el mismo QR.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const order = await prisma.order.findUnique({ where: { publicToken: token }, select: {
    orderNumber: true, status: true, fulfillmentStatus: true, deliveryType: true, updatedAt: true, createdAt: true,
    customer: { select: { name: true } }, items: { select: { id: true, description: true, quantity: true } },
  } })
  if (!order) return error('Seguimiento no encontrado.', 404)
  const now = Date.now()
  const warranties = await prisma.warrantyCase.findMany({ where: { orderItemId: { in: order.items.map(item => item.id) }, publicToken: { not: null } }, select: {
    publicToken: true, customerName: true, serial: true, status: true, expiresAt: true, warrantyDays: true,
    orderItem: { select: { description: true, product: { select: { name: true } } } },
  } })
  return json({ orderNumber: order.orderNumber, customerName: order.customer?.name || null, status: order.status,
    fulfillmentStatus: order.fulfillmentStatus, deliveryType: order.deliveryType, updatedAt: order.updatedAt, createdAt: order.createdAt,
    items: order.items.map(item => ({ description: item.description, quantity: item.quantity })),
    warranties: warranties.map(warranty => {
      const expiresAt = warranty.expiresAt ? new Date(warranty.expiresAt).getTime() : null
      return { token: warranty.publicToken, productName: warranty.orderItem?.product?.name || warranty.orderItem?.description || null,
        status: warranty.status, warrantyDays: warranty.warrantyDays,
        daysRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null, expiresAt: warranty.expiresAt }
    }) })
}
