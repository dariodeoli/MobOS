import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../lib/delivery-access'
import { closeWeek, weeklyView } from '../../../../lib/delivery-operations-store'
import { weekInput } from '../../../../lib/delivery-operations'
import { textInput } from '../../../../lib/payment-input'
import { json } from '../../../../lib/http'
export async function GET(request: Request) {
  try {
    const actor = await deliveryAccess(request, true), params = new URL(request.url).searchParams
    return json(await weeklyView(actor, textInput(params.get('branchId'), 'Sucursal', 100), textInput(params.get('driverId'), 'Repartidor', 100), weekInput(params.get('weekStart'))))
  } catch (cause) { return deliveryFailure(cause) }
}
export async function POST(request: Request) {
  try { return json(await closeWeek(await deliveryAccess(request, true), await deliveryBody(request))) }
  catch (cause) { return deliveryFailure(cause) }
}
