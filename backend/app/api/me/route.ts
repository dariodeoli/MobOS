import { AuthRateLimitError, enforceAuthRateLimit, requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { COOKIE_COMPANY, COOKIE_SELLER, readCookie, sessionCookieOptions } from '../../../lib/google-oauth'
import { DeletionError, deletePersonalAccount, verifyDeletionReauth } from '../../../lib/account-deletion'
import { logError } from '../../../lib/log'

// Borrar mi cuenta. Exige sesión + reautenticación en el mismo pedido:
// { pin } | { password } (contraseña de la empresa, solo ADMIN).
// El dueño de una tienda recibe 409 OWNER_MUST_TRANSFER_OR_DELETE_STORE.
export const dynamic = 'force-dynamic'
export async function DELETE(request: Request) {
  try {
    // Límite ANTES de cualquier consulta (sesión, usuario, hashes).
    await enforceAuthRateLimit(request, 'me-delete', 5)
    const session = await requireSession(request)
    if (!session) return error('Sesión inválida o expirada.', 401)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const ctx = { userId: session.user.id, tenantId: session.user.tenantId, accountId: session.accountId ?? null }
    await verifyDeletionReauth(ctx, body && typeof body === 'object' ? body : {})
    const result = await deletePersonalAccount(ctx)
    const response = json({ ok: true, deletedAt: result.deletedAt }, { headers: { 'Cache-Control': 'no-store' } })
    // Navegador: se limpian las cookies de sesión (el token ya quedó revocado).
    if (readCookie(request, COOKIE_COMPANY)) response.cookies.set(COOKIE_COMPANY, '', sessionCookieOptions(0))
    if (readCookie(request, COOKIE_SELLER)) response.cookies.set(COOKIE_SELLER, '', sessionCookieOptions(0))
    return response
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    if (cause instanceof DeletionError) return json({ code: cause.code, message: cause.message, ...(cause.details ? cause.details as object : {}) }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
    logError('account_delete_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return error('No se pudo borrar la cuenta. Intentá nuevamente.', 503)
  }
}
