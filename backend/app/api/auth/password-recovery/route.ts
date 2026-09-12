import { randomBytes } from 'node:crypto'
import { hashToken } from '../../../../lib/auth'
import { sendPasswordRecoveryEmail, recoveryEmailReady } from '../../../../lib/email'
import { json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Always returns the same response so this endpoint never reveals whether an
// email belongs to a MobOS company.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!emailPattern.test(email)) return json({ ok: true, recoveryAvailable: recoveryEmailReady(), message: 'Si existe una cuenta con ese correo, recibirá instrucciones para restablecer su contraseña.' }, { status: 202 })
  const tenant = await prisma.tenant.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (tenant && recoveryEmailReady()) {
    const token = randomBytes(32).toString('hex')
    await prisma.$transaction(async tx => {
      await tx.passwordResetToken.deleteMany({ where: { tenantId: tenant.id, usedAt: null } })
      await tx.passwordResetToken.create({ data: { tenantId: tenant.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RECOVERY_REQUESTED', entity: 'Tenant', entityId: tenant.id, metadata: { providerConfigured: true } } })
    })
    const sent = await sendPasswordRecoveryEmail({ to: tenant.email!, companyName: tenant.name, token })
    if (!sent) await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RECOVERY_DELIVERY_FAILED', entity: 'Tenant', entityId: tenant.id, metadata: {} } })
  } else if (tenant) {
    await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RECOVERY_REQUESTED_UNAVAILABLE', entity: 'Tenant', entityId: tenant.id, metadata: { providerConfigured: false } } })
  }
  return json({ ok: true, recoveryAvailable: recoveryEmailReady(), message: 'Si existe una cuenta con ese correo, recibirá instrucciones para restablecer su contraseña.' }, { status: 202 })
}
