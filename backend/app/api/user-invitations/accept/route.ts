import bcrypt from 'bcryptjs'
import { authRequestMetadata, createInvitedSellerSession, hashToken } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { pinValido } from '../../../../lib/pin'
import { COOKIE_SELLER, sessionCookieOptions } from '../../../../lib/google-oauth'
import { prisma } from '../../../../lib/prisma'

const safeInvalid = () => error('La invitación venció, fue revocada o ya fue utilizada.', 400)

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || !pinValido(pin) || !deviceId || deviceId.length > 200) return safeInvalid()
  const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(`USER_INVITATION:${token}`) } })
  const now = new Date()
  if (!invitation || invitation.consumedAt || invitation.revokedAt || invitation.expiresAt <= now) return safeInvalid()
  const pinHash = await bcrypt.hash(pin, 12)
  try {
    const result = await prisma.$transaction(async tx => {
      const consumed = await tx.userInvitation.updateMany({ where: { id: invitation.id, tenantId: invitation.tenantId, tokenHash: invitation.tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
      if (!consumed.count) throw new Error('INVITATION_UNAVAILABLE')
      await tx.emailOutbox.updateMany({ where: { aggregateType: 'UserInvitation', aggregateId: invitation.id, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
      if (invitation.branchId && !await tx.branch.findFirst({ where: { id: invitation.branchId, tenantId: invitation.tenantId, isActive: true }, select: { id: true } })) throw new Error('INVITATION_UNAVAILABLE')
      const created = await tx.user.create({ data: { tenantId: invitation.tenantId, email: invitation.email, name: invitation.name, role: invitation.role, branchId: invitation.branchId, permissions: invitation.permissions ?? undefined, pinHash, pinLength: pin.length } })
      const session = await createInvitedSellerSession(tx, created, deviceId)
      await tx.auditLog.create({ data: { tenantId: invitation.tenantId, userId: created.id, action: 'USER_INVITATION_ACCEPTED', entity: 'UserInvitation', entityId: invitation.id, metadata: { sessionId: session.sessionId, ...authRequestMetadata(request) } } })
      return { created, session }
    })
    const response = json({ ok: true, user: result.session.user, message: 'Invitación aceptada. Tu sesión ya está activa.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(COOKIE_SELLER, result.session.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
    return response
  } catch { return safeInvalid() }
}
