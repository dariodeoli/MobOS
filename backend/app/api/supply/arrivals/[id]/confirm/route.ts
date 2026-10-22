import { json } from '../../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, confirmArrival } from '../../../../../../lib/arrival-service'
import { moduloGuard } from '../../../../../../lib/modulos-guard'

type RouteContext = { params: Promise<{ id: string }> }

// Confirma la llegada en UNA transacción con candados. Confirmar de nuevo
// devuelve el mismo resumen (`repetida: true`) sin tocar nada.
export async function POST(request: Request, { params }: RouteContext) {
  const moduloApagado = await moduloGuard(request, 'abastecimiento'); if (moduloApagado) return moduloApagado
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  try { return json(await confirmArrival(actor, String((await params).id || ''), request.headers.get('Idempotency-Key'))) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.confirm') }
}
