import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../../lib/delivery-access'
import { deactivateTariff } from '../../../../../lib/delivery-operations-store'
import { json } from '../../../../../lib/http'
export async function PATCH(request: Request, context: { params: Promise<{ tariffId: string }> }) {
  try { return json(await deactivateTariff(await deliveryAccess(request, true), (await context.params).tariffId, await deliveryBody(request))) }
  catch (cause) { return deliveryFailure(cause) }
}
