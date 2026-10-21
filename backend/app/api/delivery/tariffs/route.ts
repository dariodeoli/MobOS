import { prisma } from '../../../../lib/prisma'
import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../lib/delivery-access'
import { saveTariff } from '../../../../lib/delivery-operations-store'
import { json } from '../../../../lib/http'
import { moduloGuard } from '../../../../lib/modulos-guard'
export async function GET(request: Request) {
  try {
    const actor = await deliveryAccess(request)
    const rows = await prisma.deliveryTariff.findMany({ where: { tenantId: actor.tenantId }, orderBy: { validFrom: 'desc' }, take: 200 })
    return json({ owner: actor.owner, rows })
  } catch (cause) { return deliveryFailure(cause) }
}
export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, 'delivery'); if (moduloApagado) return moduloApagado
  try { return json(await saveTariff(await deliveryAccess(request, true), await deliveryBody(request)), { status: 201 }) }
  catch (cause) { return deliveryFailure(cause) }
}
