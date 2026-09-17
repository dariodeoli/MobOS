import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

// Convierte la cotización en un pedido pendiente (sin movimientos de stock:
// el stock y los IMEI se confirman al cobrar/entregar en el POS).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const tenant = session.user.tenantId
  const quote = await prisma.quote.findFirst({ where: { id, tenantId: tenant } })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id && quote.branchId !== session.user.branchId) return error('No autorizado.', 403)
  if (quote.status === 'CONVERTED') return error('La cotización ya fue convertida en pedido.', 409)
  if (quote.status === 'CANCELLED') return error('La cotización está cancelada.', 409)
  const items = Array.isArray(quote.items) ? quote.items as Array<Record<string, unknown>> : []
  if (!items.length) return error('La cotización no tiene ítems.', 409)
  const total = Math.max(0, quote.totalPyg)
  try {
    const order = await prisma.$transaction(async tx => {
      const created = await tx.order.create({ data: {
        tenantId: tenant,
        branchId: quote.branchId,
        customerId: quote.customerId,
        sellerId: session.user.id,
        orderNumber: `MOB-${Date.now()}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`,
        subtotalPyg: quote.subtotalPyg,
        discountPyg: quote.discountPyg,
        totalPyg: total,
        notes: `Cotización ${quote.number}${quote.notes ? ` · ${quote.notes}` : ''}`,
        status: 'PENDING',
        items: { create: items.map(item => ({
          productId: typeof item.productId === 'string' && item.productId ? item.productId : undefined,
          description: typeof item.description === 'string' && item.description ? item.description : 'Producto',
          quantity: Number(item.quantity) || 1,
          unitPricePyg: Number(item.unitPricePyg) || 0,
          totalPyg: Number(item.totalPyg) || 0,
        })) },
      }, include: { items: true } })
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'CONVERTED', orderId: created.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_CONVERTED', entity: 'Quote', entityId: quote.id, metadata: { orderId: created.id, orderNumber: created.orderNumber } } })
      return created
    })
    return json(order, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo convertir la cotización.', 409) }
}
