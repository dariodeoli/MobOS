import { authRequestMetadata, hashToken } from '../../../../../lib/auth'
import { sendWelcomeOnce } from '../../../../../lib/email-actions'
import { logEmailOutcome } from '../../../../../lib/email'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

const safeInvalid = () => error('El enlace venció o ya fue utilizado. Pedí uno nuevo.', 400)

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!/^[a-f0-9]{64}$/i.test(token)) return safeInvalid()
  const now = new Date()
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(`EMAIL_VERIFICATION:${token}`) }, select: { id: true, tenantId: true, purpose: true, expiresAt: true, consumedAt: true, revokedAt: true } })
  if (!record || record.purpose !== 'EMAIL_VERIFICATION' || record.consumedAt || record.revokedAt || record.expiresAt <= now) return safeInvalid()
  const verified = await prisma.$transaction(async tx => {
    const consumed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, purpose: 'EMAIL_VERIFICATION', consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
    if (!consumed.count) return false
    await tx.emailOutbox.updateMany({ where: { aggregateType: 'EmailVerificationToken', aggregateId: record.id, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
    await tx.tenant.update({ where: { id: record.tenantId }, data: { emailVerifiedAt: now } })
    await tx.auditLog.create({ data: { tenantId: record.tenantId, action: 'EMAIL_VERIFIED', entity: 'Tenant', entityId: record.tenantId, metadata: authRequestMetadata(request) } })
    return true
  })
  if (!verified) return safeInvalid()
  await sendWelcomeOnce(record.tenantId).catch(() => logEmailOutcome('welcome', 'delivery-failed'))
  return json({ ok: true, message: 'Correo verificado correctamente.' })
}
