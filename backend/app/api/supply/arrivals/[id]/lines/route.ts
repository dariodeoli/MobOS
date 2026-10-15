import { error, json } from '../../../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, patchLine } from '../../../../../../lib/arrival-service'

type RouteContext = { params: Promise<{ id: string }> }

// Edita una línea del borrador (producto, serie, destino, vínculos, nota) y
// vuelve a validar toda la llegada.
export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return error('JSON inválido.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Objeto JSON obligatorio.')
  try { return json(await patchLine(actor, String((await params).id || ''), body)) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.line') }
}
