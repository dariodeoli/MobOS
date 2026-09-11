import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const methods = ['CASH', 'TRANSFER', 'CARD', 'CREDIT'] as const
const statuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'REFUNDED'] as const
const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const where = session.user.role === 'VENDEDOR'
    ? { tenantId: tenant, branchId: session.user.branchId, sellerId: session.user.id }
    : session.user.role === 'CAJERA'
      ? { tenantId: tenant, branchId: session.user.branchId }
      : { tenantId: tenant }
  return json(await prisma.order.findMany({ where, include: { items: true, payments: true, customer: true, seller: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const body = await request.json(); const items = Array.isArray(body.items) ? body.items : []; const payments = Array.isArray(body.payments) ? body.payments : (body.payment ? [body.payment] : [])
  if (!items.length) return error('Productos son obligatorios.')
  const discount = body.discountPyg ?? 0; const delivery = body.deliveryPyg ?? 0
  if (!safeInt(discount) || !safeInt(delivery)) return error('Descuento y delivery inválidos.')
  try {
    const result = await prisma.$transaction(async tx => {
      const branchId = session.user.branchId
      if (branchId && !await tx.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } })) throw new Error('Sucursal no encontrada.')
      if (body.customerId && !await tx.customer.findFirst({ where: { id: body.customerId, tenantId: tenant }, select: { id: true } })) throw new Error('Cliente no encontrado.')
      let subtotal = 0; const normalized: Array<{ productId?: string; description: string; quantity: number; unitPricePyg: number; totalPyg: number }> = []
      for (const item of items) {
        const quantity = Number(item.quantity); const price = Number(item.unitPricePyg ?? item.pricePyg ?? item.price ?? 0)
        if (!safeInt(quantity, 1) || !safeInt(price) || !Number.isSafeInteger(quantity * price)) throw new Error('Cantidad y precio inválidos.')
        if (item.productId) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: tenant, isActive: true } })
          if (!product) throw new Error(`Producto no encontrado: ${item.productId}`)
          if ((branchId === null && product.branchId !== null) || (branchId && product.branchId !== null && product.branchId !== branchId)) throw new Error('El producto pertenece a otra sucursal.')
          const updated = await tx.product.updateMany({ where: { id: product.id, tenantId: tenant, isActive: true, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }), stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
          if (!updated.count) throw new Error('Stock insuficiente o producto fuera de la sucursal.')
        }
        const line = quantity * price; subtotal += line
        if (!Number.isSafeInteger(subtotal)) throw new Error('Total fuera de rango seguro.')
        normalized.push({ productId: item.productId || undefined, description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : 'Producto', quantity, unitPricePyg: price, totalPyg: line })
      }
      if (discount > subtotal) throw new Error('El descuento no puede superar el subtotal.')
      const total = subtotal - discount + delivery
      if (!safeInt(subtotal) || !safeInt(total)) throw new Error('Total inválido.')
      let confirmed = 0
      for (const payment of payments) {
        const amount = Number(payment.amountPyg); const status = payment.status || 'CONFIRMED'
        if (!safeInt(amount, 1) || !methods.includes(payment.method) || !statuses.includes(status)) throw new Error('Pago inválido.')
        if (status === 'CONFIRMED') { confirmed += amount; if (!Number.isSafeInteger(confirmed) || confirmed > total) throw new Error('Los pagos superan el total.') }
      }
      return tx.order.create({ data: { tenantId: tenant, branchId, customerId: body.customerId, sellerId: session.user.id, orderNumber: body.orderNumber || `MOB-${Date.now()}`, subtotalPyg: subtotal, discountPyg: discount, deliveryPyg: delivery, deliveryType: typeof body.deliveryType === 'string' ? body.deliveryType : undefined, deliveryNotes: typeof body.deliveryNotes === 'string' ? body.deliveryNotes : undefined, totalPyg: total, status: confirmed >= total ? 'COMPLETED' : 'PENDING', items: { create: normalized }, payments: { create: payments.map((payment: any) => ({ tenantId: tenant, method: payment.method, amountPyg: Number(payment.amountPyg), status: payment.status || 'CONFIRMED', reference: payment.reference })) } }, include: { items: true, payments: true } })
    })
    return json(result, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear la venta.', 409) }
}
