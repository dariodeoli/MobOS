import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Mi cuenta (#253): la superficie personal de cualquier rol — perfil (nombre y
// correo), foto y sesiones propias. No expone datos de la empresa ni de otros
// integrantes y no pide permisos de administración: cada persona administra lo
// suyo. Las preferencias del dispositivo viven en el navegador (no viajan acá).
const NAME_MIN = 2
const NAME_MAX = 100

function nombreValido(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= NAME_MIN && value.trim().length <= NAME_MAX
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const now = new Date()
  const [usuario, sessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, avatar: { select: { userId: true } } },
    }),
    prisma.session.findMany({
      where: { tenantId: session.user.tenantId, userId: session.user.id, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, level: true, deviceId: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    }),
  ])
  if (!usuario) return error('Usuario no encontrado.', 404)
  return json({
    perfil: {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
      hasAvatar: Boolean(usuario.avatar),
    },
    currentSessionId: session.sessionId,
    sessions,
  })
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'updateName') {
    if (!nombreValido(body?.name)) return error(`El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`, 400)
    const name = body.name.trim()
    const perfil = await prisma.$transaction(async tx => {
      const usuario = await tx.user.update({ where: { id: session.user.id }, data: { name }, select: { id: true, name: true } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ACCOUNT_NAME_UPDATED', entity: 'User', entityId: session.user.id, metadata: { name } } })
      return usuario
    })
    return json({ ok: true, perfil })
  }

  if (action === 'revokeOtherSessions') {
    const now = new Date()
    const revoked = await prisma.$transaction(async tx => {
      const { count } = await tx.session.updateMany({
        where: { tenantId: session.user.tenantId, userId: session.user.id, revokedAt: null, id: { not: session.sessionId } },
        data: { revokedAt: now },
      })
      if (count) await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ACCOUNT_SESSIONS_REVOKED', entity: 'Session', entityId: session.user.id, metadata: { count, others: true } } })
      return count
    })
    return json({ ok: true, revoked })
  }

  if (action === 'revokeSession') {
    const id = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!id || id.length > 128) return error('Sesión inválida.', 400)
    if (id === session.sessionId) return error('Para cerrar la sesión actual usá Salir.', 409)
    const target = await prisma.session.findFirst({ where: { id, tenantId: session.user.tenantId, userId: session.user.id, revokedAt: null }, select: { id: true } })
    if (!target) return error('La sesión ya no está activa.', 404)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.session.update({ where: { id: target.id }, data: { revokedAt: now } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ACCOUNT_SESSION_REVOKED', entity: 'Session', entityId: target.id, metadata: { personal: true } } })
    })
    return json({ ok: true, revokedSessionId: target.id })
  }

  return error('Acción inválida.', 400)
}
