import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { canManageDelivery, canUseDelivery, deliverySummary } from '../../../../lib/delivery'

// Pedidos del reparto.
// - Repartidor (`delivery:use`): solo los asignados a él.
// - Tienda (`delivery:manage`): su alcance de siempre (ADMIN/GERENTE todo el
//   tenant, VENDEDOR lo suyo, CAJERA su sucursal) con filtro por asignación.
const ESTADOS = ['activos', 'entregados', 'todos']

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: { select: { id: true, description: true, quantity: true, serials: true } },
  customer: { select: { id: true, name: true, phone: true, countryCode: true, addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true, label: true, address: true, city: true, department: true, notes: true, isDefault: true } } } },
  assignedTo: { select: { id: true, name: true } },
  payments: { select: { id: true, amountPyg: true, method: true, status: true, reference: true, deliveryUserId: true, collectedAt: true, deliverySettlementId: true, createdAt: true, userId: true } },
})

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const esRepartidor = canUseDelivery(session.user)
  const esGestor = canManageDelivery(session.user)
  if (!esRepartidor && !esGestor) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const estado = params.get('estado') || 'activos'
  if (!ESTADOS.includes(estado)) return error('Estado de reparto inválido.')
  const asignado = params.get('asignado') || 'todos'
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100))
  const where: Prisma.OrderWhereInput = { tenantId: tenant, status: { not: 'CANCELLED' } }
  if (esRepartidor && !esGestor) where.assignedToId = session.user.id
  else {
    if (asignado === 'sin-asignar') where.assignedToId = null
    else if (asignado === 'asignados') where.assignedToId = { not: null }
    else if (asignado !== 'todos') where.assignedToId = asignado
    if (session.user.role === 'VENDEDOR') where.sellerId = session.user.id
    if (session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE') where.branchId = session.user.branchId
  }
  if (estado === 'activos') where.fulfillmentStatus = { not: 'DELIVERED' }
  else if (estado === 'entregados') where.fulfillmentStatus = 'DELIVERED'
  const rows = await prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, take: limit })
  return json(rows.map(order => ({ ...order, delivery: deliverySummary(order) })))
}
