import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { branchScope, deliveryAccess, deliveryBody, deliveryFailure } from '../../../../lib/delivery-access'
import { createTrip, tripInclude } from '../../../../lib/delivery-operations-store'
import { json } from '../../../../lib/http'
import { moduloGuard } from '../../../../lib/modulos-guard'
export async function GET(request: Request) {
  try {
    const actor = await deliveryAccess(request), params = new URL(request.url).searchParams
    const branchId = branchScope(actor, params.get('branchId') || undefined)
    const where: Prisma.DeliveryTripWhereInput = { tenantId: actor.tenantId, ...(branchId ? { branchId } : {}) }
    if (actor.driverOnly) where.driverId = actor.userId
    if (!actor.owner && actor.user.role === 'VENDEDOR') where.OR = [{ order: { sellerId: actor.userId } }, { createdById: actor.userId }]
    if (params.get('unresolved') === 'true') { where.orderId = null; where.status = 'COMPLETED' }
    const rows = await prisma.deliveryTrip.findMany({ where, include: tripInclude, orderBy: { createdAt: 'desc' }, take: 200 })
    return json({ owner: actor.owner, rows })
  } catch (cause) { return deliveryFailure(cause) }
}
export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, 'delivery'); if (moduloApagado) return moduloApagado
  try { return json(await createTrip(await deliveryAccess(request), await deliveryBody(request)), { status: 201 }) }
  catch (cause) { return deliveryFailure(cause) }
}
