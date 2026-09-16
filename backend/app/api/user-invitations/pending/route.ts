import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

// Invitaciones pendientes dirigidas al correo del usuario autenticado, en
// cualquier empresa: el filtro es SOLO por email (normalizado a minúsculas
// como en la creación), nunca por tenant. Nunca se expone tokenHash.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const email = (await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } }))?.email?.trim().toLowerCase() ?? ''
  if (!email) return json([])
  const now = new Date()
  const invitations = await prisma.userInvitation.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
    include: { tenant: { select: { name: true } }, inviter: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return json(invitations.map(invitation => ({
    id: invitation.id,
    companyName: invitation.tenant.name,
    inviterName: invitation.inviter.name,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    branchId: invitation.branchId,
  })))
}
