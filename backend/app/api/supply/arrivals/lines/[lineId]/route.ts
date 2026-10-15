import { error, json } from '../../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, completeMissingSerial } from '../../../../../../lib/arrival-service'

type RouteContext = { params: Promise<{ lineId: string }> }

// Completa una línea «Falta IMEI» de una llegada ya confirmada: recién acá nace
// la unidad (con el costo y el proveedor de la línea).
export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  let body: { serial?: unknown }
  try { body = await request.json() } catch { return error('JSON inválido.') }
  try { return json(await completeMissingSerial(actor, String((await params).lineId || ''), body?.serial)) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.serial') }
}
