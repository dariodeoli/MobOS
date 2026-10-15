import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../../../lib/delivery-access'
import { adjustWeek } from '../../../../../../lib/delivery-operations-store'
import { json } from '../../../../../../lib/http'
export async function POST(request: Request, context: { params: Promise<{ closeId: string }> }) {
  try { return json(await adjustWeek(await deliveryAccess(request, true), (await context.params).closeId, await deliveryBody(request))) }
  catch (cause) { return deliveryFailure(cause) }
}
