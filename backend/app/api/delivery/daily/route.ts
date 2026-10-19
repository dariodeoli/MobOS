import { deliveryAccess, deliveryBody, deliveryFailure } from '../../../../lib/delivery-access'
import { closeDay, dailyView } from '../../../../lib/delivery-operations-store'
import { dayInput } from '../../../../lib/delivery-operations'
import { textInput } from '../../../../lib/payment-input'
import { json } from '../../../../lib/http'

/** Vista y cierre del día del reparto. Las fechas son días civiles de America/Asuncion. */
export async function GET(request: Request) {
  try {
    const actor = await deliveryAccess(request, true), params = new URL(request.url).searchParams
    return json(await dailyView(actor, textInput(params.get('branchId'), 'Sucursal', 100), textInput(params.get('driverId'), 'Repartidor', 100), dayInput(params.get('businessDay'), 'Día')))
  } catch (cause) { return deliveryFailure(cause) }
}

export async function POST(request: Request) {
  try { return json(await closeDay(await deliveryAccess(request, true), await deliveryBody(request)), { status: 201 }) }
  catch (cause) { return deliveryFailure(cause) }
}
