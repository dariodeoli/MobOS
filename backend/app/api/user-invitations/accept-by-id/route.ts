import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { authRequestMetadata, effectivePermissions, requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { pinValido } from '../../../../lib/pin'
import { prisma } from '../../../../lib/prisma'

// Aceptación autenticada por id de invitación (sin token crudo). El usuario
// sigue logueado en SU tenant: acá solo se crea el User en el tenant
// invitador. No se crea sesión de operador invitado ni se toca la sesión
// actual (el ingreso a la tienda invitada usa el login de esa tienda + PIN).
// Decisión de duplicados: si ya existe un usuario con ese correo en el
// tenant invitador (cualquier estado, igual que la creación) → 409.
const INVALID_MESSAGE = 'La invitación no es válida o ya venció.'
const ALREADY_MEMBER_MESSAGE = 'Ya sos parte de esa tienda.'

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!id || !pinValido(pin)) return error(INVALID_MESSAGE, 400)
  if (deviceId && deviceId.length > 200) return error(INVALID_MESSAGE, 400)
  const email = (await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } }))?.email?.trim().toLowerCase() ?? ''
  if (!email) return error(INVALID_MESSAGE, 410)
  const invitation = await prisma.userInvitation.findUnique({ where: { id } })
  if (!invitation) return error(INVALID_MESSAGE, 404)
  const now = new Date()
  if (invitation.consumedAt || invitation.revokedAt || invitation.expiresAt <= now) return error(INVALID_MESSAGE, 410)
  if (invitation.email.trim().toLowerCase() !== email) return error(INVALID_MESSAGE, 410)
  const pinHash = await bcrypt.hash(pin, 12)
  try {
    const created = await prisma.$transaction(async tx => {
      const existing = await tx.user.findFirst({ where: { tenantId: invitation.tenantId, email: { equals: invitation.email, mode: 'insensitive' } }, select: { id: true } })
      if (existing) throw new Error('ALREADY_MEMBER')
      const consumed = await tx.userInvitation.updateMany({ where: { id: invitation.id, tenantId: invitation.tenantId, tokenHash: invitation.tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
      if (!consumed.count) throw new Error('INVITATION_UNAVAILABLE')
      await tx.emailOutbox.updateMany({ where: { aggregateType: 'UserInvitation', aggregateId: invitation.id, sentAt: null }, data: { cancelledAt: now, lockedAt: null, recipient: '', payload: '' } })
      if (invitation.branchId && !await tx.branch.findFirst({ where: { id: invitation.branchId, tenantId: invitation.tenantId, isActive: true }, select: { id: true } })) throw new Error('INVITATION_UNAVAILABLE')
      const user = await tx.user.create({ data: { tenantId: invitation.tenantId, email: invitation.email, name: invitation.name, role: invitation.role, branchId: invitation.branchId, permissions: invitation.permissions ?? undefined, pinHash, pinLength: pin.length } })
      await tx.auditLog.create({ data: { tenantId: invitation.tenantId, userId: user.id, action: 'USER_INVITATION_ACCEPTED', entity: 'UserInvitation', entityId: invitation.id, metadata: { ...authRequestMetadata(request) } } })
      return user
    })
    return json({ ok: true, user: { id: created.id, tenantId: created.tenantId, name: created.name, role: created.role, branchId: created.branchId, permissions: effectivePermissions(created.role, created.permissions) }, message: 'Invitación aceptada.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'ALREADY_MEMBER') return error(ALREADY_MEMBER_MESSAGE, 409)
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') return error(ALREADY_MEMBER_MESSAGE, 409)
    return error(INVALID_MESSAGE, 410)
  }
}
