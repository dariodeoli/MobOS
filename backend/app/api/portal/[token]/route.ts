import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { enforceRateLimit } from '../../../../lib/rate-limit'

// Resumen de cuenta público del cliente. El token es aleatorio y no
// enumerable, y el nivel acota lo que se muestra:
// - rapido: empresa, nombre, saldo pendiente total, vencimientos y últimos 10
//   pedidos (número, fecha, total, estado de pago/entrega).
// - completo: además garantías activas, direcciones del cliente y el enlace al
//   comprobante de cada pedido (solo si tiene token público).
// Nunca expone costos, márgenes, notas internas, teléfonos, datos de otros
// clientes ni información de contacto de terceros.
const text = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '')

async function buscarPortal(token: string) {
  if (!token || token.length > 200) return null
  return prisma.customerPortalToken.findFirst({
    where: { token, revokedAt: null },
    select: {
      level: true,
      tenantId: true,
      customerId: true,
      customer: { select: { name: true, publicNote: true } },
      tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
    },
  })
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'customer-portal', 30, 60_000)
  if (limited) return limited

  const { token } = await context.params
  const portal = await buscarPortal(text(token))
  if (!portal) return error('Cuenta no encontrada.', 404)

  const completo = portal.level === 'completo'
  const now = Date.now()

  const [orders, saldo, dueOrders, warrantyRows] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, archivedAt: null },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalPyg: true,
        status: true,
        fulfillmentStatus: true,
        dueAt: true,
        publicToken: true,
        payments: { where: { status: 'CONFIRMED' }, select: { amountPyg: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ pending: bigint }>>`
      SELECT COALESCE(SUM(GREATEST(0, o."totalPyg" - COALESCE(p.confirmed, 0))), 0)::bigint AS pending
      FROM "Order" o
      LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${portal.tenantId} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
      WHERE o."tenantId" = ${portal.tenantId} AND o."customerId" = ${portal.customerId} AND o."status" <> 'CANCELLED'`,
    prisma.order.findMany({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, status: { not: 'CANCELLED' }, dueAt: { not: null } },
      select: { orderNumber: true, dueAt: true, totalPyg: true, payments: { where: { status: 'CONFIRMED' }, select: { amountPyg: true } } },
      orderBy: { dueAt: 'asc' },
      take: 50,
    }),
    completo
      ? prisma.warrantyCase.findMany({
          where: { tenantId: portal.tenantId, customerId: portal.customerId, status: { not: 'DELIVERED' } },
          select: { serial: true, description: true, status: true, expiresAt: true, warrantyDays: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),
  ])

  const pendienteDe = (totalPyg: number, pagos: Array<{ amountPyg: number }>) =>
    Math.max(0, Number(totalPyg) - pagos.reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0))

  const vencimientos = dueOrders
    .map(order => ({
      orderNumber: order.orderNumber,
      dueAt: order.dueAt,
      pendingPyg: pendienteDe(order.totalPyg, order.payments),
    }))
    .filter(order => order.pendingPyg > 0)

  const payload: Record<string, unknown> = {
    level: portal.level,
    company: { name: portal.tenant?.name || null, logo: Boolean(portal.tenant?.logos?.length) },
    customer: { name: portal.customer?.name || null, publicNote: portal.customer?.publicNote || null },
    balancePyg: Number(saldo[0]?.pending || 0n),
    dueDates: vencimientos,
    orders: orders.map(order => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      totalPyg: order.totalPyg,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      pendingPyg: pendienteDe(order.totalPyg, order.payments),
      dueAt: order.dueAt,
      ...(completo && order.publicToken ? { receiptToken: order.publicToken } : {}),
    })),
  }

  if (completo) {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: portal.customerId },
      select: { label: true, address: true, city: true, department: true, country: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      take: 20,
    })
    payload.warranties = warrantyRows.map(warranty => ({
      serial: warranty.serial,
      description: warranty.description,
      status: warranty.status,
      warrantyDays: warranty.warrantyDays,
      expiresAt: warranty.expiresAt,
      daysRemaining: warranty.expiresAt ? Math.max(0, Math.ceil((new Date(warranty.expiresAt).getTime() - now) / 86400000)) : null,
    }))
    payload.addresses = addresses.map(address => ({
      label: address.label,
      address: address.address,
      city: address.city,
      department: address.department,
      country: address.country,
      isDefault: address.isDefault,
    }))
  }

  return json(payload)
}
