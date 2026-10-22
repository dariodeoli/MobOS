import { ArchivedTenantError, CompanySessionRequiredError, authenticateSeller, AuthRateLimitError, enforceAuthRateLimit } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { AuthFlowError } from '../../../../lib/google-oauth'
import { COOKIE_SELLER, sessionCookieOptions } from '../../../../lib/google-oauth'
import { isNativeClient } from '../../../../lib/native-client'

export async function POST(request: Request) {
  let desbloqueo = false
  try {
    await enforceAuthRateLimit(request, 'seller-pin', 20)
    const body = await request.json().catch(() => null)
    if (!body) return error('Solicitud inválida.', 400)
    if (!body.pin) return error('El PIN es obligatorio.', 400)
    desbloqueo = body.desbloqueo === true
    const result = await authenticateSeller(request, body)
    if (result && 'duplicated' in result) return json({ code: 'PIN_DUPLICATED', message: 'Hay más de un usuario con ese PIN. Pedí al administrador que asigne PINs únicos.' }, { status: 409 })
    // Desde la pantalla de bloqueo (la sesión sigue viva) un PIN errado no es una sesión caída: 422 evita invalidar los datos privados.
    if (!result) return json({ code: 'INVALID_PIN', message: 'PIN inválido.' }, { status: desbloqueo ? 422 : 401 })
    // Cliente nativo: sellerToken en el cuerpo y sin cookie.
    const native = isNativeClient(request)
    const response = json({ user: result.user, ...(native ? { sellerToken: result.accessToken, expiresAt: result.expiresAt } : {}) })
    if (!native) response.cookies.set(COOKIE_SELLER, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
    return response
  } catch (err) {
    if (err instanceof CompanySessionRequiredError) return json({ code: 'COMPANY_SESSION_REQUIRED', message: err.message }, { status: desbloqueo ? 422 : 401, headers: { 'Cache-Control': 'no-store' } })
    if (err instanceof ArchivedTenantError) return json({ code: 'TENANT_ARCHIVED', message: err.message }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    if (err instanceof AuthRateLimitError) return json({ message: err.message }, { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    return error(err instanceof AuthFlowError ? err.message : 'No se pudo validar el acceso. Intentá nuevamente.', err instanceof AuthFlowError ? err.status : 503)
  }
}
