import { ArchivedTenantError, authenticateCompany, AuthRateLimitError, enforceAuthRateLimit } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { COOKIE_COMPANY, sessionCookieOptions } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, 'company-login', 20)
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return error('No se pudo iniciar sesión. Revisá tus datos e intentá nuevamente.', 400)
    if (!body.email || !body.password || !body.deviceId) return error('Correo, contraseña y dispositivo son obligatorios.', 400)
    const result = await authenticateCompany(body, request)
    if (!result) return error('Credenciales inválidas.', 401)
    const response = json({ expiresAt: result.expiresAt, tenant: result.tenant, sellers: result.sellers, onboardingRequired: result.onboardingRequired, scope: result.scope })
    response.cookies.set(COOKIE_COMPANY, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
    return response
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    if (cause instanceof ArchivedTenantError) return json({ code: 'TENANT_ARCHIVED', message: cause.message }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    return error('No se pudo iniciar sesión. Intentá nuevamente.', 503)
  }
}
