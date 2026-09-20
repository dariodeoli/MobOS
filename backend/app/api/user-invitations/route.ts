import { Prisma } from '@prisma/client'
import { authRequestMetadata, requireSession } from '../../../lib/auth'
import { emailTransportConfigured } from '../../../lib/email'
import { deliverInvitation, emailPattern, enqueueInvitation, invitationToken, INVITATION_COOLDOWN_MS, INVITATION_TTL_MS, permissionsData, serializeInvitation, validPermissions, validRole } from '../../../lib/user-invitations'
import { error, json } from '../../../lib/http'
import { withEmailOutboxTransaction } from '../../../lib/email-outbox'
import { prisma } from '../../../lib/prisma'

async function adminSession(request: Request) {
  const session = await requireSession(request)
  if (!session) return { response: error('Sesión inválida.', 401) }
  if (session.user.role !== 'ADMIN') return { response: error('No autorizado.', 403) }
  return { session }
}

export async function GET(request: Request) {
  const access = await adminSession(request); if ('response' in access) return access.response
  const invitations = await prisma.userInvitation.findMany({ where: { tenantId: access.session.user.tenantId }, include: { inviter: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } })
  return json(invitations.map(serializeInvitation))
}

export async function POST(request: Request) {
  const access = await adminSession(request); if ('response' in access) return access.response
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body?.role ?? 'VENDEDOR'
  const branchId = typeof body?.branchId === 'string' && body.branchId ? body.branchId : null
  if (!name || name.length > 100 || !emailPattern.test(email) || !validRole(role) || !validPermissions(body?.permissions)) return error('Revisá el nombre, correo, rol y permisos.', 400)
  if (!emailTransportConfigured()) return error('El envío de correo todavía no está configurado.', 503)
  const tenantId = access.session.user.tenantId
  if (await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } }, select: { id: true } })) return error('Ese correo ya pertenece a un usuario del equipo.', 409)
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId, isActive: true }, select: { id: true } })) return error('Sucursal no encontrada.', 400)
  const now = new Date()
  const token = invitationToken()
  try {
    const prepared = await withEmailOutboxTransaction('invitation-create', async tx => {
      await tx.userInvitation.updateMany({ where: { tenantId, email, consumedAt: null, revokedAt: null, expiresAt: { lte: now } }, data: { revokedAt: now } })
      const created = await tx.userInvitation.create({ data: { tenantId, email, name, role, branchId, permissions: permissionsData(body?.permissions), inviterId: access.session.user.id, tokenHash: token.tokenHash, sentAt: now, resendAvailableAt: new Date(now.getTime() + INVITATION_COOLDOWN_MS), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) }, include: { inviter: { select: { id: true, name: true } } } })
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } })
      const job = await enqueueInvitation(tx, { invitationId: created.id, tenantId, to: email, inviteeName: name, companyName: tenant.name, inviterName: access.session.user.name, token: token.token })
      await tx.auditLog.create({ data: { tenantId, userId: access.session.user.id, action: 'USER_INVITATION_CREATED', entity: 'UserInvitation', entityId: created.id, metadata: { role, branchId, ...authRequestMetadata(request) } } })
      return { invitation: created, jobId: job.id }
    })
    const sent = await deliverInvitation(prepared.jobId)
    return json({ ...serializeInvitation(prepared.invitation), deliveryState: sent ? 'sent' : 'queued' }, { status: 201 })
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      // La invitación activa sigue viva: se devuelve completa para que la app
      // ofrezca reenviarla o revocarla en vez de dejar solo el texto del error.
      const existing = await prisma.userInvitation.findFirst({ where: { tenantId, email, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, include: { inviter: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } })
      return error('Ya existe una invitación activa para ese correo.', 409, existing ? { invitation: serializeInvitation(existing) } : undefined)
    }
    return error('No se pudo crear la invitación.', 500)
  }
}
