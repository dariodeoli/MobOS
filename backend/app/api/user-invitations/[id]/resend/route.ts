import { hasPermission, requireSession } from '../../../../../lib/auth'
import { emailTransportConfigured } from '../../../../../lib/email'
import { deliverInvitation, enqueueInvitation, invitationToken, INVITATION_COOLDOWN_MS, INVITATION_TTL_MS, serializeInvitation } from '../../../../../lib/user-invitations'
import { error, json } from '../../../../../lib/http'
import { withEmailOutboxTransaction } from '../../../../../lib/email-outbox'

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!hasPermission(session.user, 'team:manage')) return error('No autorizado.', 403)
  if (!emailTransportConfigured()) return error('El envío de correo todavía no está configurado.', 503)
  const tenantId = session.user.tenantId
  const now = new Date()
  try {
    const prepared = await withEmailOutboxTransaction('invitation-resend', async tx => {
      await tx.$queryRaw`SELECT "id" FROM "UserInvitation" WHERE "id" = ${context.params.id} FOR UPDATE`
      const current = await tx.userInvitation.findFirst({ where: { id: context.params.id, tenantId, consumedAt: null, revokedAt: null }, include: { tenant: { select: { name: true } } } })
      if (!current || current.expiresAt <= now) throw new Error('INVITATION_NOT_FOUND')
      const pending = await tx.emailOutbox.findFirst({ where: { aggregateType: 'UserInvitation', aggregateId: current.id, sentAt: null, cancelledAt: null, failedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      if (pending) return { invitation: current, jobId: pending.id }
      if (current.resendAvailableAt > now) throw new Error(`INVITATION_COOLDOWN:${Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 1000)}`)
      const token = invitationToken()
      const updated = await tx.userInvitation.update({ where: { id: current.id }, data: { tokenHash: token.tokenHash, sentAt: now, resendAvailableAt: new Date(now.getTime() + INVITATION_COOLDOWN_MS), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } })
      const job = await enqueueInvitation(tx, { invitationId: updated.id, tenantId, to: updated.email, inviteeName: updated.name, companyName: current.tenant.name, inviterName: session.user.name, token: token.token })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'USER_INVITATION_RESENT', entity: 'UserInvitation', entityId: updated.id, metadata: {} } })
      return { invitation: updated, jobId: job.id }
    })
    const sent = await deliverInvitation(prepared.jobId)
    return json({ ...serializeInvitation(prepared.invitation), deliveryState: sent ? 'sent' : 'queued' })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'INVITATION_NOT_FOUND') return error('La invitación no está disponible.', 404)
    if (cause instanceof Error && cause.message.startsWith('INVITATION_COOLDOWN:')) return error('Esperá antes de reenviar la invitación.', 429, { retryAfterSeconds: Number(cause.message.split(':')[1]) })
    return error('La invitación cambió mientras se procesaba la solicitud.', 409)
  }
}
