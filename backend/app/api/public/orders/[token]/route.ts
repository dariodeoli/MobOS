import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim(); if (!token || token.length > 200) return error('Pedido no encontrado.', 404)
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { items: { select: { description: true, quantity: true, unitPricePyg: true, totalPyg: true } }, customer: { select: { name: true } }, branch: { select: { name: true, address: true, city: true, phone: true, instagram: true } }, tenant: { select: { name: true, slug: true } } } })
  if (!order) return error('Pedido no encontrado.', 404)
  // El token no enumerable es la autorización. Aun así se omiten teléfono, dirección, pagos y vendedor.
  return json({ orderNumber: order.orderNumber, createdAt: order.createdAt, financialStatus: order.status, fulfillmentStatus: order.fulfillmentStatus, totalPyg: order.totalPyg, customerName: order.customer?.name || 'Cliente', items: order.items, store: { name: order.tenant.name, slug: order.tenant.slug, branch: order.branch } })
}
