import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { purchaseTotals } from '../../../../lib/purchases'

type RouteContext = { params: { id: string } }

// Detalle de una compra con líneas, pagos y auditoría (creación, anticipos,
// pagos, recepción y ediciones de costos). GERENTE replica el alcance de
// /api/purchases: solo ve órdenes de su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['purchases:manage'])) return error('No autorizado.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Compra obligatoria.')

  const branchId = session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
  const purchase = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: session.user.tenantId, ...(branchId ? { branchId } : {}) },
    include: {
      lines: true,
      payments: { orderBy: { paidAt: 'asc' } },
      supplier: { select: { id: true, name: true } },
    },
  })
  if (!purchase) return error('Compra no encontrada.', 404)

  const lineIds = purchase.lines.map(line => line.id)
  const audit = await prisma.auditLog.findMany({
    where: { tenantId: session.user.tenantId, entity: { in: ['PurchaseOrder', 'PurchaseLine'] }, entityId: { in: [purchase.id, ...lineIds] } },
    select: { id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const totals = purchaseTotals(purchase.lines, purchase.payments)
  return json({ purchase: { ...purchase, ...totals }, audit })
}
