import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

const REAUTH_WINDOW_MS = 10 * 60 * 1000

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede exportar datos.', 403)
  const active = await prisma.session.findFirst({ where: { id: session.sessionId, tenantId: session.user.tenantId, revokedAt: null }, select: { reauthenticatedAt: true } })
  if (!active?.reauthenticatedAt || Date.now() - active.reauthenticatedAt.getTime() > REAUTH_WINDOW_MS) return error('Reautenticá tu contraseña antes de exportar.', 403)
  const tenantId = session.user.tenantId
  const [tenant, branches, users, customers, products, orders, payments] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, email: true, slug: true, createdAt: true, archivedAt: true } }),
    prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true, address: true, city: true, phone: true, isActive: true, createdAt: true } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true, role: true, status: true, branchId: true, lastAccessAt: true, createdAt: true } }),
    prisma.customer.findMany({ where: { tenantId }, take: 5000, include: { addresses: true } }),
    prisma.product.findMany({ where: { tenantId }, take: 5000, select: { id: true, sku: true, name: true, category: true, condition: true, pricePyg: true, costPyg: true, stock: true, isActive: true, createdAt: true, updatedAt: true } }),
    prisma.order.findMany({ where: { tenantId }, take: 5000, orderBy: { createdAt: 'desc' }, include: { items: true, customer: { select: { id: true, name: true } } } }),
    prisma.payment.findMany({ where: { tenantId }, take: 10000, orderBy: { createdAt: 'desc' }, select: { id: true, orderId: true, method: true, status: true, amountPyg: true, currency: true, originalAmount: true, exchangeRatePyg: true, reference: true, paidAt: true, createdAt: true } }),
  ])
  await prisma.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'TENANT_DATA_EXPORTED', entity: 'Tenant', entityId: tenantId, metadata: { customers: customers.length, products: products.length, orders: orders.length, payments: payments.length } } })
  return json({ exportedAt: new Date().toISOString(), format: 'mobos-basic-json-v1', tenant, branches, users, customers, products, orders, payments, limits: { customers: 5000, products: 5000, orders: 5000, payments: 10000 }, excluded: ['passwordHash', 'pinHash', 'session tokens', 'payment proof bytes', 'audit metadata'] })
}
