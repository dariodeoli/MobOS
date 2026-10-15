import { error, json } from '../../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, parseArrival } from '../../../../../../lib/arrival-service'

type RouteContext = { params: Promise<{ id: string }> }

// Pegado en seco: parsea, concilia y reemplaza las líneas del borrador. No toca
// stock ni pedidos; devuelve las líneas con sus hallazgos y el resumen previo.
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  let body: { text?: unknown }
  try { body = await request.json() } catch { return error('JSON inválido.') }
  try { return json(await parseArrival(actor, String((await params).id || ''), body?.text)) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.parse') }
}
