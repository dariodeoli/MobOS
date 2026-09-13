import bcrypt from 'bcryptjs'
import { authRequestMetadata, hashToken } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8 || Buffer.byteLength(password) > 72) return error('El enlace o la contraseña no son válidos.', 400)
  const now = new Date()
  const reset = await prisma.passwordResetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } } })
  if (!reset) return error('El enlace venció o ya fue utilizado. Pedí uno nuevo.', 400)
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction(async tx => {
    const consumed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: now } })
    if (!consumed.count) throw new Error('El enlace ya fue utilizado.')
    await tx.tenant.update({ where: { id: reset.tenantId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } })
    await tx.session.updateMany({ where: { tenantId: reset.tenantId, revokedAt: null }, data: { revokedAt: now } })
    await tx.auditLog.create({ data: { tenantId: reset.tenantId, action: 'PASSWORD_RESET_COMPLETED', entity: 'Tenant', entityId: reset.tenantId, metadata: authRequestMetadata(request) } })
  })
  return json({ ok: true, message: 'Contraseña actualizada. Volvé a iniciar sesión.' })
}
