import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { authRequestMetadata, hashToken, requiresAdminPinSetup } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { COOKIE_COMPANY, sessionCookieOptions } from '../../../../lib/google-oauth'

const SESSION_DAYS = 7

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8 || Buffer.byteLength(password) > 72) return error('El enlace o la contraseña no son válidos.', 400)
  const now = new Date()
  const reset = await prisma.passwordResetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } } })
  if (!reset) return error('El enlace venció o ya fue utilizado. Pedí uno nuevo.', 400)
  const passwordHash = await bcrypt.hash(password, 12)
  // El enlace de recuperación prueba el control del correo, así que además de
  // cambiar la contraseña abrimos la sesión de la empresa: la persona entra
  // directo a elegir su usuario y PIN, sin volver a escribir la contraseña.
  const accessToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  const result = await prisma.$transaction(async tx => {
    const consumed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: now } })
    if (!consumed.count) throw new Error('El enlace ya fue utilizado.')
    await tx.emailOutbox.updateMany({ where: { aggregateType: 'PasswordResetToken', aggregateId: reset.id, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
    const tenant = await tx.tenant.update({ where: { id: reset.tenantId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null }, select: { id: true, name: true, slug: true, settings: true } })
    // Se cierran todas las sesiones anteriores y se abre una nueva de este
    // dispositivo, creada después del cierre para que no quede revocada.
    await tx.session.updateMany({ where: { tenantId: reset.tenantId, revokedAt: null }, data: { revokedAt: now } })
    const session = await tx.session.create({ data: { tenantId: tenant.id, userId: null, level: 'COMPANY', deviceId: `reset:${randomBytes(16).toString('hex')}`, tokenHash: hashToken(accessToken), expiresAt } })
    const sellers = await tx.user.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE', OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, branchId: true }, orderBy: { name: 'asc' } })
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RESET_COMPLETED', entity: 'Tenant', entityId: tenant.id, metadata: { ...authRequestMetadata(request), autoSessionId: session.id } } })
    return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, sellers, onboardingRequired: requiresAdminPinSetup(tenant.settings) }
  })
  const response = json({
    ok: true,
    message: 'Contraseña actualizada. Elegí tu usuario y poné tu PIN para entrar.',
    tenant: result.tenant,
    sellers: result.sellers,
    onboardingRequired: result.onboardingRequired,
    expiresAt,
    scope: 'device:company',
    autoLogin: true,
  })
  response.cookies.set(COOKIE_COMPANY, accessToken, sessionCookieOptions(SESSION_DAYS * 24 * 60 * 60))
  return response
}
