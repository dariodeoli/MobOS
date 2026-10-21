import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../../../lib/delivery-access'
import { adjustWeek } from '../../../../../../lib/delivery-operations-store'
import { json } from '../../../../../../lib/http'
import { moduloGuard } from '../../../../../../lib/modulos-guard'
export async function POST(request: Request, context: { params: Promise<{ closeId: string }> }) {
  const moduloApagado = await moduloGuard(request, 'delivery'); if (moduloApagado) return moduloApagado
  try { return json(await adjustWeek(await deliveryAccess(request, true), (await context.params).closeId, await deliveryBody(request))) }
  catch (cause) { return deliveryFailure(cause) }
}
