import { AuthRateLimitError, requireAccountContext } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { COOKIE_COMPANY, COOKIE_SELLER, sameOrigin, sessionCookieOptions } from '../../../../lib/google-oauth'
import { createCompany, TenantSwitchError, type SwitchResult } from '../../../../lib/tenant-switch'

const NO_STORE = { 'Cache-Control': 'no-store' }

function withSessions(result: SwitchResult, status: number) {
  const response = json({ expiresAt: result.expiresAt, tenant: result.tenant, sellers: result.sellers, user: result.user, onboardingRequired: result.onboardingRequired, scope: result.scope }, { status })
  response.cookies.set(COOKIE_COMPANY, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
  // Sin sesión de vendedor en el destino la app muestra la pantalla de PIN.
  if (result.sellerToken) response.cookies.set(COOKIE_SELLER, result.sellerToken, sessionCookieOptions(7 * 24 * 60 * 60))
  else response.cookies.set(COOKIE_SELLER, '', sessionCookieOptions(0))
  return response
}

export async function POST(request: Request) {
  try {
    // Con cookies solo se acepta el origen de la app; con Bearer no hay CSRF.
    if (!request.headers.get('authorization') && !sameOrigin(request)) return error('Origen de solicitud no permitido.', 403)
    const ctx = await requireAccountContext(request)
    if (!ctx) return error('Sesión inválida o sin cuenta vinculada.', 401)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    // El tenant sale de la sesión; solo se lee el destino pedido.
    const result = await createCompany(request, ctx, body?.companyName)
    return withSessions(result, 201)
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), ...NO_STORE } })
    if (cause instanceof TenantSwitchError) return json({ code: cause.code, message: cause.message }, { status: cause.status, headers: NO_STORE })
    console.error(JSON.stringify({ route: 'createCompany', error: cause instanceof Error ? cause.message : String(cause) }))
    return error('No se pudo completar la operación. Intentá nuevamente.', 503)
  }
}
