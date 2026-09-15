import { AuthRateLimitError, enforceAuthRateLimit } from '../../../../../lib/auth'
import { issueEmailVerification, waitForPublicAuthResponseFloor } from '../../../../../lib/email-actions'
import { json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

const message = 'Si la cuenta necesita verificación, enviaremos un nuevo enlace cuando esté disponible.'

export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    await enforceAuthRateLimit(request, 'email-verification-resend', 8)
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const tenant = await prisma.tenant.findUnique({ where: { email }, select: { id: true } })
      if (tenant) await issueEmailVerification(tenant.id, request, true)
    }
    await waitForPublicAuthResponseFloor(startedAt)
    return json({ ok: true, message }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    await waitForPublicAuthResponseFloor(startedAt)
    return json({ ok: true, message }, { status: 202, headers: { 'Cache-Control': 'no-store', ...(cause instanceof AuthRateLimitError ? { 'Retry-After': String(cause.retryAfterSeconds) } : {}) } })
  }
}
