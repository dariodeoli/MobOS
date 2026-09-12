import { authenticateSeller } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { AuthFlowError } from '../../../../lib/google-oauth'
import { COOKIE_SELLER, sessionCookieOptions } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return error('Solicitud inválida.', 400)
    if (!body.pin) return error('El PIN es obligatorio.', 400)
    if (!body.sellerId && !body.userId) return error('El vendedor es obligatorio.', 400)
    const result = await authenticateSeller(request, body)
    if (!result) return error('PIN inválido.', 401)
    const response = json({ user: result.user })
    response.cookies.set(COOKIE_SELLER, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
    return response
  } catch (err) {
    return error(err instanceof AuthFlowError ? err.message : 'No se pudo validar el acceso. Intentá nuevamente.', err instanceof AuthFlowError ? err.status : 503)
  }
}
