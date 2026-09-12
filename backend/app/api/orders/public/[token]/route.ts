import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

// Vista pública mínima: el token opaco es el único identificador compartible.
// Nunca expone pagos, costos, IMEI, teléfonos, direcciones ni datos internos.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const order = await prisma.order.findUnique({ where: { publicToken: token }, select: {
    orderNumber: true, status: true, fulfillmentStatus: true, deliveryType: true, updatedAt: true,
    customer: { select: { name: true } }, items: { select: { description: true, quantity: true } },
  } })
  if (!order) return error('Seguimiento no encontrado.', 404)
  return json({ orderNumber: order.orderNumber, customerName: order.customer?.name || null, status: order.status,
    fulfillmentStatus: order.fulfillmentStatus, deliveryType: order.deliveryType, updatedAt: order.updatedAt, items: order.items })
}
