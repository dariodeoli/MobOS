import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const now = new Date()
  const invitation = await prisma.userInvitation.findFirst({ where: { id: context.params.id, tenantId: session.user.tenantId, consumedAt: null, revokedAt: null }, select: { id: true, tokenHash: true } })
  if (!invitation) return error('La invitación no está disponible.', 404)
  const revoked = await prisma.$transaction(async tx => {
    const transitioned = await tx.userInvitation.updateMany({ where: { id: invitation.id, tenantId: session.user.tenantId, tokenHash: invitation.tokenHash, consumedAt: null, revokedAt: null }, data: { revokedAt: now } })
    if (!transitioned.count) return false
    await tx.emailOutbox.updateMany({ where: { aggregateType: 'UserInvitation', aggregateId: invitation.id, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'USER_INVITATION_REVOKED', entity: 'UserInvitation', entityId: invitation.id, metadata: {} } })
    return true
  })
  if (!revoked) return error('La invitación cambió mientras se procesaba la solicitud.', 409)
  return json({ ok: true, message: 'Invitación revocada.' })
}
