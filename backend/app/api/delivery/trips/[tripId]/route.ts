import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../../lib/delivery-access'
import { resolveTrip } from '../../../../../lib/delivery-operations-store'
import { json } from '../../../../../lib/http'
import { moduloGuard } from '../../../../../lib/modulos-guard'
export async function PATCH(request: Request, context: { params: Promise<{ tripId: string }> }) {
  const moduloApagado = await moduloGuard(request, 'delivery'); if (moduloApagado) return moduloApagado
  try { return json(await resolveTrip(await deliveryAccess(request, true), (await context.params).tripId, await deliveryBody(request))) }
  catch (cause) { return deliveryFailure(cause) }
}
