import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'

// Cada persona ve y cierra solamente sus propias sesiones operativas. No se
// exponen tokens, dispositivos completos ni sesiones de otros integrantes.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const now = new Date()
  const sessions = await prisma.session.findMany({
    where: { tenantId: session.user.tenantId, userId: session.user.id, level: 'SELLER', revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, branchId: true },
    orderBy: { lastSeenAt: 'desc' },
  })
  return json({ currentSessionId: session.sessionId, sessions })
}

export async function DELETE(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const body = await request.json().catch(() => null)
  const id = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (!id || id.length > 128) return error('Sesión inválida.', 400)
  const target = await prisma.session.findFirst({ where: { id, tenantId: session.user.tenantId, userId: session.user.id, level: 'SELLER', revokedAt: null }, select: { id: true } })
  if (!target) return error('Sesión no encontrada.', 404)
  await prisma.$transaction(async tx => {
    await tx.session.update({ where: { id }, data: { revokedAt: new Date() } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'SESSION_REVOKED', entity: 'Session', entityId: id, metadata: { reason: 'user_session_management' } } })
  })
  return json({ ok: true, current: id === session.sessionId })
}
