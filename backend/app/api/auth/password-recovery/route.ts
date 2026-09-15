import { AuthRateLimitError, authRequestMetadata, enforceAuthRateLimit } from '../../../../lib/auth'
import { emailTransportConfigured, logEmailOutcome } from '../../../../lib/email'
import { issuePasswordRecovery, waitForPublicAuthResponseFloor } from '../../../../lib/email-actions'
import { json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const neutralMessage = 'Si existe una cuenta con ese correo, recibirá instrucciones para restablecer su contraseña.'
const neutralResponse = (retryAfter?: number) => json({ ok: true, message: neutralMessage }, { status: 202, headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } })

// Always returns the same response so this endpoint never reveals whether an
// email belongs to a MobOS company.
export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
  await enforceAuthRateLimit(request, 'password-recovery', 8)
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!emailPattern.test(email)) {
    await waitForPublicAuthResponseFloor(startedAt)
    return neutralResponse()
  }
  const tenant = await prisma.tenant.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (tenant && emailTransportConfigured()) {
    await issuePasswordRecovery(tenant.id, request)
  } else if (tenant) {
    await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RECOVERY_REQUESTED_UNAVAILABLE', entity: 'Tenant', entityId: tenant.id, metadata: { providerConfigured: false, ...authRequestMetadata(request) } } })
    logEmailOutcome('password-recovery', 'unconfigured')
  }
  await waitForPublicAuthResponseFloor(startedAt)
  return neutralResponse()
  } catch (cause) {
    await waitForPublicAuthResponseFloor(startedAt)
    return neutralResponse(cause instanceof AuthRateLimitError ? cause.retryAfterSeconds : undefined)
  }
}
