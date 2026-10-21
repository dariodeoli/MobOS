import { enforceAuthRateLimit } from '../../../../lib/auth'
import { json } from '../../../../lib/http'
import { AuthRateLimitError, readUnlockPin, UnlockInputError, unlockCurrentSeller } from '../../../../lib/seller-unlock'

export async function POST(request: Request) {
  const reply = (body: unknown, status: number, headers = {}) => json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
  try {
    await enforceAuthRateLimit(request, 'seller-unlock-ip', 20)
    const pin = await readUnlockPin(request)
    const result = await unlockCurrentSeller(request, pin)
    if (result.kind === 'session') return reply({ code: 'SELLER_SESSION_REQUIRED', message: 'Tu acceso venció o ya no está disponible. Cerrá sesión y volvé a ingresar con tu acceso, o pedí una nueva invitación a tu tienda.' }, 401)
    // The session is valid; a failed confirmation must not purge its private
    // snapshots as a session-authorization 401 would. Sign-in /pin stays 401.
    if (result.kind === 'pin') return reply({ code: 'INVALID_PIN', message: 'PIN inválido.' }, 422)
    if (result.kind === 'limited') return reply({ code: 'PIN_LOCKED', message: 'Demasiados intentos. Esperá unos minutos e intentá nuevamente.' }, 429, { 'Retry-After': String(result.retryAfterSeconds) })
    return reply({ user: result.user }, 200)
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return reply({ message: cause.message }, 429, { 'Retry-After': String(cause.retryAfterSeconds) })
    if (cause instanceof UnlockInputError) return reply({ message: cause.message }, cause.status)
    return reply({ message: 'No se pudo validar el acceso. Intentá nuevamente.' }, 503)
  }
}
