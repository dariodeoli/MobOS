import { json } from '../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, getArrival } from '../../../../../lib/arrival-service'

type RouteContext = { params: Promise<{ id: string }> }

// Detalle de la llegada: líneas con hallazgos, proveedor como sigla para quien
// no ve el nombre y costos solo con permiso.
export async function GET(request: Request, { params }: RouteContext) {
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  try { return json(await getArrival(actor, String((await params).id || ''))) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.detail') }
}
