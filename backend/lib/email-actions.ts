import { randomBytes } from 'node:crypto'
import { authRequestMetadata, hashToken } from './auth'
import { emailTransportConfigured, emailVerificationEmail, logEmailOutcome, passwordRecoveryEmail, welcomeEmail } from './email'
import { dispatchEmailOutboxJob, enqueueEmail, pendingEmailForAggregate, withEmailOutboxTransaction } from './email-outbox'
import { prisma } from './prisma'

export const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1000
export const EMAIL_VERIFICATION_COOLDOWN_MS = 5 * 60 * 1000
export const PASSWORD_RECOVERY_TTL_MS = 30 * 60 * 1000
export const PASSWORD_RECOVERY_COALESCE_MS = 60 * 1000
export const PUBLIC_AUTH_RESPONSE_FLOOR_MS = 500

export async function waitForPublicAuthResponseFloor(startedAt: number, floorMs = PUBLIC_AUTH_RESPONSE_FLOOR_MS) {
  const remaining = floorMs - (Date.now() - startedAt)
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining))
}

async function lockTenant(tx: any, tenantId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE
  `
  return rows.length > 0
}

async function dispatchIssued(jobId: string) {
  const delivery = await dispatchEmailOutboxJob(jobId)
  if (delivery.state === 'sent') return { state: 'sent' as const }
  if (delivery.state === 'busy' || delivery.state === 'deferred' || delivery.state === 'already-sent') return { state: 'already-issued' as const }
  return { state: 'delivery-failed' as const }
}

export async function issueEmailVerification(tenantId: string, request?: Request, enforceCooldown = false) {
  if (!emailTransportConfigured()) {
    logEmailOutcome('email-verification', 'unconfigured')
    return { state: 'unconfigured' as const }
  }
  const prepared = await withEmailOutboxTransaction('email-verification', async tx => {
    if (!await lockTenant(tx, tenantId)) return { state: 'not-needed' as const }
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, email: true, name: true, emailVerifiedAt: true } })
    if (!tenant?.email || tenant.emailVerifiedAt) return { state: 'not-needed' as const }

    const now = new Date()
    const latest = await tx.emailVerificationToken.findFirst({
      where: { tenantId, purpose: 'EMAIL_VERIFICATION', consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { sentAt: 'desc' },
      select: { id: true, sentAt: true },
    })
    if (latest) {
      const pending = await pendingEmailForAggregate(tx, 'EmailVerificationToken', latest.id)
      const retryAfterMs = latest.sentAt.getTime() + EMAIL_VERIFICATION_COOLDOWN_MS - now.getTime()
      if (enforceCooldown && retryAfterMs > 0) return { state: 'cooldown' as const, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
      if (!enforceCooldown) return pending ? { state: 'dispatch' as const, jobId: pending.id } : { state: 'already-issued' as const }
    }

    const token = randomBytes(32).toString('hex')
    const message = emailVerificationEmail({ to: tenant.email, companyName: tenant.name, token })
    if (!message) return { state: 'unconfigured' as const }
    const superseded = await tx.emailVerificationToken.findMany({ where: { tenantId, purpose: 'EMAIL_VERIFICATION', consumedAt: null, revokedAt: null }, select: { id: true } })
    await tx.emailVerificationToken.updateMany({ where: { id: { in: superseded.map(item => item.id) } }, data: { revokedAt: now } })
    await tx.emailOutbox.updateMany({ where: { aggregateType: 'EmailVerificationToken', aggregateId: { in: superseded.map(item => item.id) }, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
    const record = await tx.emailVerificationToken.create({ data: { tenantId, purpose: 'EMAIL_VERIFICATION', tokenHash: hashToken(`EMAIL_VERIFICATION:${token}`), expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS), sentAt: now } })
    const job = await enqueueEmail(tx, { tenantId, kind: 'email-verification', aggregateType: 'EmailVerificationToken', aggregateId: record.id, message })
    await tx.auditLog.create({ data: { tenantId, action: 'EMAIL_VERIFICATION_ISSUED', entity: 'EmailVerificationToken', entityId: record.id, metadata: request ? authRequestMetadata(request) : {} } })
    return { state: 'dispatch' as const, jobId: job.id }
  })
  return prepared.state === 'dispatch' ? dispatchIssued(prepared.jobId) : prepared
}

export async function issuePasswordRecovery(tenantId: string, request?: Request) {
  if (!emailTransportConfigured()) {
    logEmailOutcome('password-recovery', 'unconfigured')
    return { state: 'unconfigured' as const }
  }
  const prepared = await withEmailOutboxTransaction('password-recovery', async tx => {
    if (!await lockTenant(tx, tenantId)) return { state: 'not-needed' as const }
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, email: true, name: true } })
    if (!tenant?.email) return { state: 'not-needed' as const }
    const now = new Date()
    const recent = await tx.passwordResetToken.findFirst({
      where: { tenantId, usedAt: null, expiresAt: { gt: now }, createdAt: { gt: new Date(now.getTime() - PASSWORD_RECOVERY_COALESCE_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (recent) {
      const pending = await pendingEmailForAggregate(tx, 'PasswordResetToken', recent.id)
      return pending ? { state: 'dispatch' as const, jobId: pending.id } : { state: 'already-issued' as const }
    }

    const token = randomBytes(32).toString('hex')
    const message = passwordRecoveryEmail({ to: tenant.email, companyName: tenant.name, token })
    if (!message) return { state: 'unconfigured' as const }
    const superseded = await tx.passwordResetToken.findMany({ where: { tenantId, usedAt: null }, select: { id: true } })
    await tx.passwordResetToken.updateMany({ where: { id: { in: superseded.map(item => item.id) } }, data: { usedAt: now } })
    await tx.emailOutbox.updateMany({ where: { aggregateType: 'PasswordResetToken', aggregateId: { in: superseded.map(item => item.id) }, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
    const [{ expiresAt: venceReset }] = await tx.$queryRaw<Array<{ expiresAt: Date }>>`SELECT now() + interval '30 minutes' AS "expiresAt"`
    const record = await tx.passwordResetToken.create({ data: { tenantId, tokenHash: hashToken(token), expiresAt: venceReset } })
    const job = await enqueueEmail(tx, { tenantId, kind: 'password-recovery', aggregateType: 'PasswordResetToken', aggregateId: record.id, message })
    await tx.auditLog.create({ data: { tenantId, action: 'PASSWORD_RECOVERY_REQUESTED', entity: 'Tenant', entityId: tenant.id, metadata: { providerConfigured: true, ...(request ? authRequestMetadata(request) : {}) } } })
    return { state: 'dispatch' as const, jobId: job.id }
  })
  return prepared.state === 'dispatch' ? dispatchIssued(prepared.jobId) : prepared
}

export async function sendWelcomeOnce(tenantId: string) {
  if (!emailTransportConfigured()) {
    logEmailOutcome('welcome', 'unconfigured')
    return false
  }
  const prepared = await withEmailOutboxTransaction('welcome', async tx => {
    if (!await lockTenant(tx, tenantId)) return null
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, email: true, name: true, welcomeEmailSentAt: true } })
    if (!tenant?.email || tenant.welcomeEmailSentAt) return null
    const existing = await tx.emailOutbox.findFirst({ where: { kind: 'welcome', aggregateType: 'Tenant', aggregateId: tenant.id, cancelledAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, sentAt: true } })
    if (existing) return existing.sentAt ? null : existing.id
    const message = welcomeEmail({ to: tenant.email, companyName: tenant.name, tenantId: tenant.id })
    if (!message) return null
    return (await enqueueEmail(tx, { tenantId, kind: 'welcome', aggregateType: 'Tenant', aggregateId: tenant.id, message })).id
  })
  if (!prepared) return false
  const result = await dispatchEmailOutboxJob(prepared)
  return result.state === 'sent' || result.state === 'already-sent'
}
