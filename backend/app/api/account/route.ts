import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const REAUTH_WINDOW_MS = 10 * 60 * 1000
const ADMIN_ROLE = 'ADMIN'

function input(value: unknown, field: string, min = 1, max = 500) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`${field} inválido.`)
  return value.trim()
}

async function adminSession(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: error('Falta sesión.', 401) as Response }
  if (session.user.role !== ADMIN_ROLE) return { error: error('Solo el dueño puede administrar la cuenta.', 403) as Response }
  return { session }
}

async function assertRecentReauth(sessionId: string, tenantId: string) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, tenantId, revokedAt: null }, select: { reauthenticatedAt: true } })
  if (!session?.reauthenticatedAt || Date.now() - session.reauthenticatedAt.getTime() > REAUTH_WINDOW_MS) throw new Error('Reautenticá tu contraseña para continuar.')
}

export async function GET(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  const { session } = context
  const now = new Date()
  const [tenant, sessions] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, name: true, email: true, slug: true, archivedAt: true, archivedReason: true, createdAt: true } }),
    prisma.session.findMany({ where: { tenantId: session.user.tenantId, revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: 'desc' }, take: 50, select: { id: true, level: true, deviceId: true, branchId: true, createdAt: true, lastSeenAt: true, expiresAt: true, user: { select: { name: true, email: true, role: true } } } }),
  ])
  if (!tenant) return error('Empresa no encontrada.', 404)
  return json({ tenant, currentSessionId: session.sessionId, reauthValidUntil: null, sessions })
}

export async function POST(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  try {
    const body = await request.json() as Record<string, unknown>
    const password = input(body.password, 'Contraseña', 1, 72)
    const tenant = await prisma.tenant.findUnique({ where: { id: context.session.user.tenantId }, select: { id: true, passwordHash: true } })
    if (!tenant?.passwordHash || !(await bcrypt.compare(password, tenant.passwordHash))) return error('No se pudo reautenticar la cuenta.', 401)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.session.update({ where: { id: context.session.sessionId }, data: { reauthenticatedAt: now } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, userId: context.session.user.id, action: 'ACCOUNT_REAUTHENTICATED', entity: 'Session', entityId: context.session.sessionId, metadata: {} } })
    })
    return json({ ok: true, validUntil: new Date(now.getTime() + REAUTH_WINDOW_MS) })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo reautenticar la cuenta.', 400) }
}

export async function PATCH(request: Request) {
  const context = await adminSession(request)
  if ('error' in context) return context.error
  try {
    const body = await request.json() as Record<string, unknown>
    const action = input(body.action, 'Acción', 1, 40)
    const { session } = context
    await assertRecentReauth(session.sessionId, session.user.tenantId)
    const now = new Date()
    if (action === 'revokeSession') {
      const targetId = input(body.sessionId, 'Sesión', 1, 200)
      const target = await prisma.session.findFirst({ where: { id: targetId, tenantId: session.user.tenantId, revokedAt: null }, select: { id: true, userId: true, level: true } })
      if (!target) return error('La sesión ya no está activa.', 404)
      await prisma.$transaction(async tx => {
        await tx.session.update({ where: { id: target.id }, data: { revokedAt: now } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ACCOUNT_SESSION_REVOKED', entity: 'Session', entityId: target.id, metadata: { level: target.level, ownSession: target.id === session.sessionId } } })
      })
      return json({ ok: true, revokedSessionId: target.id })
    }
    if (action === 'archive') {
      const reason = input(body.reason, 'Motivo de archivado', 10, 500)
      await prisma.$transaction(async tx => {
        await tx.tenant.update({ where: { id: session.user.tenantId }, data: { archivedAt: now, archivedReason: reason, lockedUntil: new Date('9999-12-31T23:59:59.999Z') } })
        await tx.session.updateMany({ where: { tenantId: session.user.tenantId, revokedAt: null }, data: { revokedAt: now } })
        await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_ARCHIVED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { reason } } })
      })
      return json({ ok: true, archivedAt: now })
    }
    return error('Acción de cuenta no admitida.', 400)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la cuenta.', 400) }
}
