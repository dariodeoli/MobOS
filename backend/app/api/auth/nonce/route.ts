import { AuthRateLimitError, enforceAuthRateLimit } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { issueAuthNonce } from '../../../../lib/auth-nonce'
import { isNativeClient } from '../../../../lib/native-client'
import { logError } from '../../../../lib/log'

// Nonce de un solo uso para Apple/Google nativos y reautenticación (docs/IOS.md).
// Body opcional: { purpose: 'login' | 'reauth' } (por defecto 'login').
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, 'auth-nonce', 30)
    if (!isNativeClient(request)) return error('Cliente no soportado.', 400)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const purpose = body?.purpose === 'reauth' ? 'reauth' : 'login'
    return json(await issueAuthNonce(purpose), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    logError('auth_nonce_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return error('No se pudo iniciar el acceso. Intentá nuevamente.', 503)
  }
}
