import { error, json } from '../../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, completeMissingSerial } from '../../../../../../lib/arrival-service'
import { moduloGuard } from '../../../../../../lib/modulos-guard'

type RouteContext = { params: Promise<{ lineId: string }> }

// Completa una línea «Falta IMEI» de una llegada ya confirmada: recién acá nace
// la unidad (con el costo y el proveedor de la línea).
export async function PATCH(request: Request, { params }: RouteContext) {
  const moduloApagado = await moduloGuard(request, 'abastecimiento'); if (moduloApagado) return moduloApagado
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  let body: { serial?: unknown; confirmSerial?: unknown }
  try { body = await request.json() } catch { return error('JSON inválido.') }
  try { return json(await completeMissingSerial(actor, String((await params).lineId || ''), body?.serial, body?.confirmSerial === true)) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.serial') }
}
