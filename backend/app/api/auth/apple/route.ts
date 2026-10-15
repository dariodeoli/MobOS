import { AuthRateLimitError, enforceAuthRateLimit, requireCompanySession, requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { AuthFlowError } from '../../../../lib/google-oauth'
import { JwtError } from '../../../../lib/jwks'
import { verifyAppleIdentityToken } from '../../../../lib/apple-auth'
import { appleNativeLogin } from '../../../../lib/native-auth'
import { isNativeClient } from '../../../../lib/native-client'
import { logError } from '../../../../lib/log'

// Sign in with Apple (app de iPhone). Contrato en docs/IOS.md.
// Body: { identityToken, nonce (crudo), fullName?, authorizationCode?, storeId?, deviceId? }.
// Con Authorization: Bearer de una sesión con cuenta, VINCULA esa cuenta con
// esta identidad de Apple (necesario cuando Apple oculta el correo real).
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Límite ANTES de cualquier consulta o verificación.
    await enforceAuthRateLimit(request, 'apple-login', 20)
    if (!isNativeClient(request)) return error('Cliente no soportado.', 400)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || typeof body.identityToken !== 'string' || typeof body.nonce !== 'string') return error('Solicitud inválida.', 400)
    const identity = await verifyAppleIdentityToken(body.identityToken, body.nonce)
    let linkAccountId: string | null = null
    if (request.headers.get('authorization')) {
      const session = await requireSession(request)
      linkAccountId = session?.accountId ?? (await requireCompanySession(request))?.accountId ?? null
      if (!linkAccountId) return error('Sesión inválida o expirada.', 401)
    }
    const result = await appleNativeLogin(identity, {
      storeId: typeof body.storeId === 'string' ? body.storeId : undefined,
      authorizationCode: body.authorizationCode,
      fullName: body.fullName,
      linkAccountId,
      deviceId: typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 200) : undefined,
    })
    return json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    if (cause instanceof JwtError) {
      if (cause.message === 'not_configured') return json({ code: 'not_configured', message: 'El acceso con Apple todavía no está configurado.' }, { status: 503 })
      return json({ code: 'invalid_identity', message: 'No se pudo validar tu identidad de Apple.' }, { status: 401 })
    }
    if (cause instanceof AuthFlowError) return json({ code: cause.code, message: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
    logError('apple_login_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return error('No se pudo iniciar sesión. Intentá nuevamente.', 503)
  }
}
