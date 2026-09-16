import { authenticateSeller, AuthRateLimitError, enforceAuthRateLimit } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { AuthFlowError } from '../../../../lib/google-oauth'
import { COOKIE_SELLER, sessionCookieOptions } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, 'seller-pin', 20)
    const body = await request.json().catch(() => null)
    if (!body) return error('Solicitud inválida.', 400)
    if (!body.pin) return error('El PIN es obligatorio.', 400)
    const result = await authenticateSeller(request, body)
    if (!result) return error('PIN inválido.', 401)
    const response = json({ user: result.user })
    response.cookies.set(COOKIE_SELLER, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
    return response
  } catch (err) {
    if (err instanceof AuthRateLimitError) return json({ message: err.message }, { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    return error(err instanceof AuthFlowError ? err.message : 'No se pudo validar el acceso. Intentá nuevamente.', err instanceof AuthFlowError ? err.status : 503)
  }
}
