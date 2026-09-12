import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { COOKIE_COMPANY, readCookie, sameOrigin } from './google-oauth'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const SESSION_DAYS = 7

export type AuthUser = {
  id: string
  tenantId: string
  name: string
  role: string
  branchId: string | null
}

export type SessionContext = {
  sessionId: string
  user: AuthUser
}

type LoginInput = { email?: unknown; password?: unknown; deviceId?: unknown; branchId?: unknown }
type PinInput = { sellerId?: unknown; userId?: unknown; pin?: unknown }

export function isSessionUsable(session: { revokedAt: Date | null; expiresAt: Date; tenantId: string; user: { status: string; tenantId: string } }, now = new Date()) {
  return !session.revokedAt && session.expiresAt > now && session.user.status === 'ACTIVE' && session.user.tenantId === session.tenantId
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function newToken() {
  return randomBytes(32).toString('hex')
}

async function createSession(tx: any, tenantId: string, userId: string | null, level: 'COMPANY' | 'SELLER', deviceId: string, branchId: string | null = null) {
  const accessToken = newToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  const session = await tx.session.create({ data: { tenantId, userId, level, deviceId, branchId, tokenHash: hashToken(accessToken), expiresAt } })
  return { accessToken, expiresAt, sessionId: session.id }
}

export async function authenticateCompany(input: LoginInput) {
  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  const deviceId = String(input.deviceId ?? '').trim()
  const branchId = input.branchId ? String(input.branchId) : null
  if (!email || !password || !deviceId) return null
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; name: string; slug: string; email: string; passwordHash: string | null; failedLoginAttempts: number; lockedUntil: Date | null }>>`
      SELECT "id", "name", "slug", "email", "passwordHash", "failedLoginAttempts", "lockedUntil"
      FROM "Tenant" WHERE "email" = ${email} FOR UPDATE
    `
    const tenant = rows[0]
    if (!tenant?.passwordHash) return null
    const now = new Date()
    const lockExpired = tenant.lockedUntil !== null && tenant.lockedUntil <= now
    const attempts = lockExpired ? 0 : tenant.failedLoginAttempts
    if (lockExpired) await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    if (tenant.lockedUntil && !lockExpired) return null
    if (!(await bcrypt.compare(password, tenant.passwordHash))) {
      const failedLoginAttempts = attempts + 1
      await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts, lockedUntil: failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null } })
      return null
    }
    await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    const sellers = await tx.user.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE', ...(branchId ? { branchId } : {}), OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, branchId: true }, orderBy: { name: 'asc' } })
    const session = await createSession(tx, tenant.id, null, 'COMPANY', deviceId, branchId)
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'COMPANY_SIGNED_IN', entity: 'Session', entityId: session.sessionId, metadata: { branchId } } })
    return { ...session, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, sellers, scope: 'device:company' as const }
  })
}

async function companySession(request: Request) {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  const cookie = readCookie(request, COOKIE_COMPANY)
  if (!match && (!cookie || !sameOrigin(request))) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match ? match[1] : cookie) } })
  if (!session || session.level !== 'COMPANY' || session.revokedAt || session.expiresAt <= new Date()) return null
  return session
}

export async function authenticateSeller(request: Request, input: PinInput) {
  const parent = await companySession(request)
  const sellerId = String(input.sellerId ?? input.userId ?? '')
  const pin = String(input.pin ?? '')
  if (!parent || !sellerId || !/^\d{4}$/.test(pin)) return null
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string; tenantId: string; name: string; role: string; branchId: string | null; pinHash: string; status: string; failedLoginAttempts: number; lockedUntil: Date | null
    }>>`
      SELECT "id", "tenantId", "name", "role", "branchId", "pinHash", "status", "failedLoginAttempts", "lockedUntil"
      FROM "User"
      WHERE "id" = ${sellerId} AND "tenantId" = ${parent.tenantId} AND "status" = 'ACTIVE'
        AND (${parent.branchId}::text IS NULL OR "branchId" = ${parent.branchId})
        AND ("branchId" IS NULL OR EXISTS (SELECT 1 FROM "Branch" b WHERE b."id" = "User"."branchId" AND b."isActive" = true))
      FOR UPDATE
    `
    const user = rows[0]
    if (!user) return null
    const now = new Date()
    const lockExpired = user.lockedUntil !== null && user.lockedUntil <= now
    const attempts = lockExpired ? 0 : user.failedLoginAttempts
    if (lockExpired) await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    if (user.lockedUntil && !lockExpired) return null
    if (!(await bcrypt.compare(pin, user.pinHash))) {
      const failedLoginAttempts = attempts + 1
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts, lockedUntil: failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null } })
      return null
    }
    await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    const session = await createSession(tx, parent.tenantId, user.id, 'SELLER', parent.deviceId, parent.branchId)
    await tx.auditLog.create({ data: { tenantId: parent.tenantId, userId: user.id, action: 'SELLER_PIN_VERIFIED', entity: 'Session', entityId: session.sessionId, metadata: { branchId: parent.branchId } } })
    return { ...session, user: sessionUser(user) }
  })
}

function sessionUser(user: { id: string; tenantId: string; name: string; role: string; branchId: string | null }): AuthUser {
  return { id: user.id, tenantId: user.tenantId, name: user.name, role: user.role, branchId: user.branchId }
}

export async function requireSession(request: Request): Promise<SessionContext | null> {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match[1]) }, include: { user: true } })
  const now = new Date()
  if (!session || session.level !== 'SELLER' || !session.userId || !session.user || !isSessionUsable({ ...session, user: session.user }, now)) return null
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
  return { sessionId: session.id, user: sessionUser(session.user) }
}

export async function revokeSession(request: Request) {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  const cookie = readCookie(request, COOKIE_COMPANY)
  if (!match && (!cookie || !sameOrigin(request))) return false
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match ? match[1] : cookie) } })
  if (!session || session.revokedAt) return false
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
  return true
}
