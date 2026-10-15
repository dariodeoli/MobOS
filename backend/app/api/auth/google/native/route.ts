import { AuthRateLimitError, enforceAuthRateLimit } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { AuthFlowError } from '../../../../../lib/google-oauth'
import { JwtError } from '../../../../../lib/jwks'
import { googleNativeLogin, verifyGoogleNativeToken } from '../../../../../lib/native-auth'
import { isNativeClient } from '../../../../../lib/native-client'
import { logError } from '../../../../../lib/log'

// Google en la app de iPhone. Body: { idToken, storeId? }. Verifica el JWT contra
// el JWKS de Google con aud = MOBOS_GOOGLE_IOS_CLIENT_ID. Solo entra a cuentas con tienda ya vinculada.
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, 'google-native', 20)
    if (!isNativeClient(request)) return error('Cliente no soportado.', 400)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || typeof body.idToken !== 'string') return error('Solicitud inválida.', 400)
    const identity = await verifyGoogleNativeToken(body.idToken)
    const result = await googleNativeLogin(identity, typeof body.storeId === 'string' ? body.storeId : undefined)
    return json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    if (cause instanceof JwtError) {
      if (cause.message === 'not_configured') return json({ code: 'not_configured', message: 'El acceso con Google todavía no está configurado.' }, { status: 503 })
      return json({ code: 'invalid_identity', message: 'No se pudo validar tu identidad de Google.' }, { status: 401 })
    }
    if (cause instanceof AuthFlowError) return json({ code: cause.code, message: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
    logError('google_native_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return error('No se pudo iniciar sesión. Intentá nuevamente.', 503)
  }
}
