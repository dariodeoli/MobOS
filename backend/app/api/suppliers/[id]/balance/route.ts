import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

// Balance del proveedor: total comprado, total pagado (incluye anticipos) y
// saldo pendiente, con desglose por orden. GERENTE replica el alcance de
// /api/purchases: solo ve órdenes de su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Proveedor obligatorio.')

  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!supplier) return error('Proveedor no encontrado.', 404)

  const branchId = session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
  if (branchId === '') return json({ supplier: { id: supplier.id, name: supplier.name }, totalPurchasedPyg: 0, paidPyg: 0, outstandingPyg: 0, orders: [] })

  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: session.user.tenantId, supplierId: id, ...(branchId ? { branchId } : {}) },
    select: {
      id: true, createdAt: true, receivedAt: true, status: true, supplierReference: true,
      lines: { select: { finalTotalCostPyg: true } },
      payments: { select: { amountPyg: true, kind: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const orderRows = orders.map(order => {
    const totalPyg = order.lines.reduce((sum, line) => sum + line.finalTotalCostPyg, 0)
    const paidPyg = order.payments.reduce((sum, payment) => sum + payment.amountPyg, 0)
    return { id: order.id, orderNumber: order.supplierReference, createdAt: order.createdAt, receivedAt: order.receivedAt, status: order.status, totalPyg, paidPyg, outstandingPyg: Math.max(0, totalPyg - paidPyg) }
  })
  const totalPurchasedPyg = orderRows.reduce((sum, order) => sum + order.totalPyg, 0)
  const paidPyg = orderRows.reduce((sum, order) => sum + order.paidPyg, 0)

  return json({ supplier: { id: supplier.id, name: supplier.name }, totalPurchasedPyg, paidPyg, outstandingPyg: Math.max(0, totalPurchasedPyg - paidPyg), orders: orderRows })
}
