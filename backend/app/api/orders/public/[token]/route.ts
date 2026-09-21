import { prisma } from '../../../../../lib/prisma'
import { createHash } from 'node:crypto'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { seguimientoDeEntrega } from '../../../../../lib/orders'

// Vista pública del pedido. El token es aleatorio y no enumerable: autoriza una
// sola vista según su nivel (rapido | completo | detallado). El token histórico
// `Order.publicToken` sigue funcionando como nivel rápido para no romper los QR
// ya entregados. Nunca expone costos, márgenes ni comentarios internos.
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta / POS',
  CREDIT: 'Crédito', TRADE_IN: 'Canje', PIX: 'Pix',
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  // Superficie pública sin sesión: se limita por IP como el portal y las
  // cotizaciones públicas (#178).
  const limited = enforceRateLimit(request, 'orders-public', 30, 60_000)
  if (limited) return limited
  const { token } = await context.params
  if (!token || token.length > 200) return error('Seguimiento no encontrado.', 404)

  const acceso = await prisma.orderAccessToken.findFirst({
    where: { token, revokedAt: null },
    select: { orderId: true, level: true },
  })
  // El token de seguimiento vive hasheado (#178); los enlaces legacy que ya
  // estaban entregados siguen resolviendo por la columna vieja.
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const order = await prisma.order.findFirst({
    where: acceso ? { id: acceso.orderId } : { OR: [{ publicTokenHash: tokenHash }, { publicToken: token }] },
    include: {
      items: { select: { id: true, description: true, quantity: true, unitPricePyg: true, listPricePyg: true, discountPyg: true, totalPyg: true } },
      payments: { orderBy: { createdAt: 'asc' } },
      customer: { select: { name: true, phone: true, countryCode: true, email: true, document: true, addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
      seller: { select: { name: true } },
      branch: { select: { name: true, address: true, city: true, department: true, phone: true, instagram: true } },
      tenant: { select: { name: true, email: true } },
    },
  })
  if (!order) return error('Seguimiento no encontrado.', 404)

  const level = acceso?.level || 'rapido'
  const pagosConfirmados = order.payments.filter(pago => pago.status === 'CONFIRMED')
  const pagado = pagosConfirmados.reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0)
  const pendiente = Math.max(0, order.totalPyg - pagado)
  // El crédito también viaja en el nivel rápido: la vista digital del cliente
  // muestra saldo, plazo y vencimiento sin exponer datos internos.
  const credito = order.creditDays
    ? { creditDays: order.creditDays, dueAt: order.dueAt, pendientePyg: pendiente }
    : null

  const now = Date.now()
  const warranties = await prisma.warrantyCase.findMany({
    where: { orderItemId: { in: order.items.map(item => item.id) }, publicToken: { not: null } },
    select: {
      publicToken: true, status: true, expiresAt: true, warrantyDays: true,
      orderItem: { select: { description: true, product: { select: { name: true } } } },
    },
  })

  // Fechas por actualización de entrega (#191): la línea de progreso del
  // tracking muestra cuándo se cumplió cada paso del método.
  const eventosEntrega = await prisma.auditLog.findMany({
    where: { tenantId: order.tenantId, entity: 'Order', entityId: order.id, action: 'ORDER_FULFILLMENT_UPDATED' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, metadata: true },
  })
  const fechasEntrega: Record<string, string> = {}
  for (const evento of eventosEntrega) {
    const actual = (evento.metadata as { current?: unknown } | null)?.current
    if (typeof actual === 'string' && !fechasEntrega[actual]) fechasEntrega[actual] = evento.createdAt.toISOString()
  }
  if (!fechasEntrega[order.fulfillmentStatus]) fechasEntrega[order.fulfillmentStatus] = order.updatedAt.toISOString()
  const tracking = seguimientoDeEntrega(order.deliveryType, order.fulfillmentStatus, fechasEntrega)

  const base = {
    level,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryType: order.deliveryType,
    tracking,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    customerName: order.customer?.name || null,
    company: { name: order.tenant?.name || null },
    items: order.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPricePyg: item.unitPricePyg,
      listPricePyg: item.listPricePyg,
      discountPyg: item.discountPyg,
      totalPyg: item.totalPyg,
    })),
    subtotalPyg: order.subtotalPyg,
    discountPyg: order.discountPyg,
    deliveryPyg: order.deliveryPyg,
    totalPyg: order.totalPyg,
    paidPyg: pagado,
    pendingPyg: pendiente,
    credit: credito,
    payments: pagosConfirmados.map(pago => ({
      method: pago.method,
      methodLabel: PAYMENT_LABELS[pago.method] || pago.method,
      amountPyg: pago.amountPyg,
      paidAt: pago.paidAt || pago.createdAt,
    })),
    warranties: warranties.map(warranty => {
      const expiresAt = warranty.expiresAt ? new Date(warranty.expiresAt).getTime() : null
      return {
        token: warranty.publicToken,
        productName: warranty.orderItem?.product?.name || warranty.orderItem?.description || null,
        status: warranty.status,
        warrantyDays: warranty.warrantyDays,
        daysRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null,
        expiresAt: warranty.expiresAt,
      }
    }),
  }

  if (level === 'rapido') return json(base)

  const completo = {
    ...base,
    company: { name: order.tenant?.name || null, email: order.tenant?.email || null },
    branch: order.branch
      ? {
          name: order.branch.name,
          address: order.branch.address,
          city: order.branch.city,
          department: order.branch.department,
          phone: order.branch.phone,
          instagram: order.branch.instagram,
        }
      : null,
    customer: order.customer
      ? {
          name: order.customer.name,
          phone: order.customer.phone,
          countryCode: order.customer.countryCode,
          email: order.customer.email,
          document: order.customer.document,
          addresses: (order.customer.addresses || []).map(address => ({
            label: address.label,
            address: address.address,
            city: address.city,
            department: address.department,
            country: address.country,
            notes: address.notes,
          })),
        }
      : null,
    billing: order.billingName || order.billingDocument
      ? { name: order.billingName, document: order.billingDocument }
      : null,
    seller: order.seller?.name || null,
    deliveryNotes: order.deliveryNotes,
    credit: credito,
    payments: pagosConfirmados.map(pago => ({
      method: pago.method,
      methodLabel: PAYMENT_LABELS[pago.method] || pago.method,
      amountPyg: pago.amountPyg,
      paidAt: pago.paidAt || pago.createdAt,
      reference: pago.reference,
      account: pago.accountSnapshot && typeof pago.accountSnapshot === 'object' ? (pago.accountSnapshot as { name?: string }).name || null : null,
    })),
  }

  if (level === 'completo') return json(completo)

  const auditoria = await prisma.auditLog.findMany({
    where: { tenantId: order.tenantId, entity: 'Order', entityId: order.id, action: 'ORDER_FULFILLMENT_UPDATED' },
    select: { action: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  const timeline = [
    { type: 'created', at: order.createdAt },
    ...auditoria.map(evento => ({ type: 'fulfillment', at: evento.createdAt, metadata: evento.metadata })),
    ...pagosConfirmados.map(pago => ({
      type: 'payment',
      at: pago.paidAt || pago.createdAt,
      amountPyg: pago.amountPyg,
      methodLabel: PAYMENT_LABELS[pago.method] || pago.method,
      account: pago.accountSnapshot && typeof pago.accountSnapshot === 'object' ? (pago.accountSnapshot as { name?: string }).name || null : null,
    })),
  ].sort((a, b) => new Date(a.at as Date).getTime() - new Date(b.at as Date).getTime())

  return json({ ...completo, timeline })
}
