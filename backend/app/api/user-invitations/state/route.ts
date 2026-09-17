import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { hashToken } from '../../../../lib/auth'

// Estado público de una invitación por token. Nunca expone ids internos ni
// credenciales: solo empresa, correo invitado, rol y si el enlace sigue activo.
// El enlace "muestra su estado real antes de autenticar".
export async function GET(request: Request) {
  const token = (new URL(request.url).searchParams.get('token') || '').trim()
  if (!/^[a-f0-9]{64}$/i.test(token)) return error('Invitación inválida.', 404)
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash: hashToken(`USER_INVITATION:${token}`) },
    include: { tenant: { select: { name: true } } },
  })
  if (!invitation) return error('Invitación inválida.', 404)
  const now = new Date()
  const status = invitation.consumedAt ? 'USED' : invitation.revokedAt ? 'REVOKED' : invitation.expiresAt <= now ? 'EXPIRED' : 'ACTIVE'
  return json({
    status,
    companyName: invitation.tenant?.name || 'MobOS',
    email: invitation.email,
    role: invitation.role,
    name: invitation.name,
    expiresAt: invitation.expiresAt,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
