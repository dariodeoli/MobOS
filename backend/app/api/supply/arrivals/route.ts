import { error, json } from '../../../../lib/http'
import { arrivalActor, arrivalErrorResponse, createArrival, listArrivals } from '../../../../lib/arrival-service'
import { moduloGuard } from '../../../../lib/modulos-guard'

// #408 unidad E · Llegada de mercadería (stock:manage, por empresa y sucursal).
//
// - GET  /api/supply/arrivals → llegadas de la sucursal (borrador y confirmadas).
// - POST /api/supply/arrivals → crea el borrador LLG-<sucursal>-NNNN; idempotente
//   por `idempotencyKey` (repetir devuelve el mismo borrador con 200).
export async function GET(request: Request) {
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  try { return json(await listArrivals(actor, new URL(request.url).searchParams)) } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.list') }
}

export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, 'abastecimiento'); if (moduloApagado) return moduloApagado
  const actor = await arrivalActor(request)
  if (actor instanceof Response) return actor
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return error('JSON inválido.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Objeto JSON obligatorio.')
  try {
    const { arrival, created } = await createArrival(actor, body)
    return json(arrival, { status: created ? 201 : 200 })
  } catch (cause) { return arrivalErrorResponse(cause, 'arrivals.create') }
}
