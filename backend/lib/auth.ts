import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import { COOKIE_COMPANY, COOKIE_SELLER, readCookie, sameOrigin } from './google-oauth'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const SESSION_DAYS = 7
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000

export class AuthRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Demasiados intentos. Esperá unos minutos e intentá nuevamente.')
  }
}

// Una tienda archivada no admite sesiones nuevas: se conserva la historia y
// solo soporte puede restaurarla.
export class ArchivedTenantError extends Error {
  constructor() {
    super('Esta tienda está archivada. Recuperala con el correo y la contraseña de la empresa desde «¿Archivaste tu empresa?», o escribinos.')
  }
}

export type AuthUser = {
  id: string
  tenantId: string
  name: string
  role: string
  branchId: string | null
  permissions: string[]
}

export type SessionContext = {
  sessionId: string
  user: AuthUser
}

type LoginInput = { email?: unknown; password?: unknown; deviceId?: unknown; branchId?: unknown }
type PinInput = { sellerId?: unknown; userId?: unknown; pin?: unknown }

export function requiresAdminPinSetup(settings: unknown) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false
  const onboarding = (settings as Record<string, unknown>).onboarding
  return !!onboarding && typeof onboarding === 'object' && !Array.isArray(onboarding) && (onboarding as Record<string, unknown>).adminPinPending === true
}

export const USER_ROLES = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO'] as const
export type UserRole = (typeof USER_ROLES)[number]

// This is a strict allow-list. Existing server-side role checks remain the
// authority; configured permissions can only reduce the baseline of a role.
const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  ADMIN: ['*'],
  GERENTE: ['dashboard:read', 'reports:read', 'products:manage', 'stock:manage', 'orders:manage', 'customers:manage', 'purchases:manage', 'cash:manage', 'warranties:manage', 'tradeins:manage', 'promotions:manage', 'service:manage'],
  VENDEDOR: ['pos:use', 'orders:own', 'customers:manage', 'products:read', 'stock:read', 'promotions:read', 'tradeins:receive'],
  CAJERA: ['pos:use', 'orders:branch', 'customers:manage', 'products:read', 'stock:read', 'payments:manage'],
  // Taller: ve stock y clientes y gestiona las órdenes de servicio técnico.
  TECNICO: ['customers:manage', 'products:read', 'stock:read', 'service:manage', 'warranties:manage'],
}

type ScheduleWindow = { days: number[]; start: string; end: string }
export type AccessSchedule = { timezone: string; windows: ScheduleWindow[] }
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const weekDays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function effectivePermissions(role: string, configured: unknown): string[] {
  const baseline = ROLE_PERMISSIONS[role as UserRole] || []
  if (baseline.includes('*')) return ['*']
  if (!Array.isArray(configured)) return [...baseline]
  const allowed = new Set(configured.filter((permission): permission is string => typeof permission === 'string'))
  return baseline.filter(permission => allowed.has(permission))
}

/** Server-side permission check. `*` is reserved for the ADMIN baseline. */
export function hasPermission(user: Pick<AuthUser, 'permissions'>, permission: string) {
  return user.permissions.includes('*') || user.permissions.includes(permission)
}

export function canAccessAny(user: Pick<AuthUser, 'permissions'>, permissions: readonly string[]) {
  return permissions.some(permission => hasPermission(user, permission))
}

export function trustedClientIp(request: Request) {
  // Proxies append X-Forwarded-For. It is trusted only when Hub is explicitly
  // declared as the proxy; otherwise an arbitrary client header is never used.
  if (process.env.MOBOS_TRUST_PROXY !== 'true') return null
  // El salto interno del middleware preserva la IP real del cliente en un
  // header propio (el X-Forwarded-For del salto apunta a 127.0.0.1).
  const internal = request.headers.get('x-mobos-client-ip')
  if (internal && request.headers.get('x-mobos-pass') === '1' && (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() === '127.0.0.1') return /^[0-9a-f:.]{3,64}$/i.test(internal) ? internal : null
  // A trusted proxy appends the client address. The right-most hop prevents a
  // caller from selecting somebody else's bucket via a forged first value.
  const candidate = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || request.headers.get('x-real-ip')?.trim() || ''
  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate : null
}

export function authRequestMetadata(request: Request) {
  const userAgent = request.headers.get('user-agent')?.slice(0, 240) || undefined
  const requestId = request.headers.get('x-request-id')?.slice(0, 120) || undefined
  const ip = trustedClientIp(request)
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(requestId ? { requestId } : {}),
    // Pseudonymous correlation for audit trails, never an IP address in clear.
    ...(ip ? { clientNetworkHash: hashToken(`network:${ip}`) } : {}),
  }
}

/** Subconjunto del cliente Prisma que usa la ventana de intentos persistente.
 * Sirve tanto para el cliente global como para un cliente transaccional. */
export type AuthAttemptStore = Pick<PrismaClient, 'authAttempt'> | Pick<Prisma.TransactionClient, 'authAttempt'>

/**
 * Ventana persistente de intentos por scope + fingerprint. Borra los registros
 * viejos, rechaza con AuthRateLimitError (y retryAfter calculado desde el
 * intento más viejo) cuando la ventana está llena y, si no, registra el intento.
 * Devuelve la cantidad consumida tras registrar. Reutilizada por el rate limit
 * de login y por las cuotas RUC; nunca persiste el valor crudo del fingerprint.
 */
export async function consumeAuthAttemptWindow(db: AuthAttemptStore, scope: string, fingerprint: string, maxAttempts: number, windowMs: number, now = new Date()) {
  const since = new Date(now.getTime() - windowMs)
  await db.authAttempt.deleteMany({ where: { scope, fingerprint, createdAt: { lt: since } } })
  const count = await db.authAttempt.count({ where: { scope, fingerprint, createdAt: { gte: since } } })
  if (count >= maxAttempts) {
    const oldest = await db.authAttempt.findFirst({ where: { scope, fingerprint, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    const retryAfterSeconds = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + windowMs - now.getTime()) / 1000))
    throw new AuthRateLimitError(retryAfterSeconds)
  }
  await db.authAttempt.create({ data: { scope, fingerprint } })
  return count + 1
}

/**
 * Persistent rate limit for unauthenticated entry points. Account/PIN locks
 * remain the authority; this limits distributed guessing when Hub forwards a
 * verified client IP (`MOBOS_TRUST_PROXY=true`).
 */
export async function enforceAuthRateLimit(request: Request, scope: string, maxAttempts: number, windowMs = AUTH_RATE_WINDOW_MS) {
  const ip = trustedClientIp(request)
  if (!ip) return
  const fingerprint = hashToken(`auth-rate:${scope}:${ip}`)
  await prisma.$transaction(async tx => {
    await consumeAuthAttemptWindow(tx, scope, fingerprint, maxAttempts, windowMs)
  })
}

export function normalizeAccessSchedule(input: unknown): AccessSchedule | null {
  if (input === null || input === undefined) return null
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Horario de acceso inválido.')
  const raw = input as Record<string, unknown>
  const timezone = typeof raw.timezone === 'string' ? raw.timezone.trim() : ''
  if (!timezone || timezone.length > 100) throw new Error('Zona horaria inválida.')
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format() } catch { throw new Error('Zona horaria inválida.') }
  if (!Array.isArray(raw.windows) || raw.windows.length > 28) throw new Error('Definí entre 0 y 28 rangos de horario.')
  const windows = raw.windows.map((value): ScheduleWindow => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Rango de horario inválido.')
    const row = value as Record<string, unknown>
    if (!Array.isArray(row.days) || !row.days.length || row.days.length > 7 || typeof row.start !== 'string' || typeof row.end !== 'string' || !timePattern.test(row.start) || !timePattern.test(row.end) || row.start === row.end) throw new Error('Rango de horario inválido.')
    const days = [...new Set(row.days)].sort().map(day => {
      if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('Día de horario inválido.')
      return day
    })
    return { days, start: row.start, end: row.end }
  })
  return { timezone, windows }
}

function localWeekdayAndMinutes(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return { day: weekDays[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function isAccessAllowed(schedule: unknown, now = new Date()) {
  if (!schedule) return true
  try {
    const normalized = normalizeAccessSchedule(schedule)
    if (!normalized || !normalized.windows.length) return false
    const { day, minutes } = localWeekdayAndMinutes(normalized.timezone, now)
    const previousDay = (day + 6) % 7
    return normalized.windows.some(window => {
      const start = toMinutes(window.start); const end = toMinutes(window.end)
      if (start < end) return window.days.includes(day) && minutes >= start && minutes < end
      return (window.days.includes(day) && minutes >= start) || (window.days.includes(previousDay) && minutes < end)
    })
  } catch { return false }
}

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
  const tienda = await tx.tenant.findUnique({ where: { id: tenantId }, select: { archivedAt: true } })
  if (tienda?.archivedAt) throw new ArchivedTenantError()
  const accessToken = newToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  const session = await tx.session.create({ data: { tenantId, userId, level, deviceId, branchId, tokenHash: hashToken(accessToken), expiresAt } })
  return { accessToken, expiresAt, sessionId: session.id }
}

export async function createInvitedSellerSession(tx: any, user: { id: string; tenantId: string; name: string; role: string; branchId: string | null; permissions?: unknown }, deviceId: string) {
  const normalizedDeviceId = deviceId.trim().slice(0, 200)
  if (!normalizedDeviceId) throw new Error('INVALID_DEVICE')
  const session = await createSession(tx, user.tenantId, user.id, 'SELLER', normalizedDeviceId, user.branchId)
  return { ...session, user: sessionUser(user) }
}

export async function authenticateCompany(input: LoginInput, request?: Request) {
  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  const deviceId = String(input.deviceId ?? '').trim()
  const branchId = input.branchId ? String(input.branchId) : null
  if (!email || !password || !deviceId) return null
  const auditMetadata = request ? authRequestMetadata(request) : {}
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; name: string; slug: string; email: string; passwordHash: string | null; settings: unknown; failedLoginAttempts: number; lockedUntil: Date | null }>>`
      SELECT "id", "name", "slug", "email", "passwordHash", "settings", "failedLoginAttempts", "lockedUntil"
      FROM "Tenant" WHERE "email" = ${email} FOR UPDATE
    `
    const tenant = rows[0]
    if (!tenant?.passwordHash) return null
    const now = new Date()
    const lockExpired = tenant.lockedUntil !== null && tenant.lockedUntil <= now
    const attempts = lockExpired ? 0 : tenant.failedLoginAttempts
    if (lockExpired) await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    if (tenant.lockedUntil && !lockExpired) {
      await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'COMPANY_SIGN_IN_BLOCKED', entity: 'Tenant', entityId: tenant.id, metadata: { branchId, ...auditMetadata } } })
      return null
    }
    if (!(await bcrypt.compare(password, tenant.passwordHash))) {
      const failedLoginAttempts = attempts + 1
      const lockedUntil = failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null
      await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts, lockedUntil } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, action: lockedUntil ? 'COMPANY_SIGN_IN_LOCKED' : 'COMPANY_SIGN_IN_FAILED', entity: 'Tenant', entityId: tenant.id, metadata: { failedLoginAttempts, branchId, ...auditMetadata } } })
      return null
    }
    await tx.tenant.update({ where: { id: tenant.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    const sellers = await tx.user.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE', ...(branchId ? { branchId } : {}), OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, branchId: true }, orderBy: { name: 'asc' } })
    const session = await createSession(tx, tenant.id, null, 'COMPANY', deviceId, branchId)
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'COMPANY_SIGNED_IN', entity: 'Session', entityId: session.sessionId, metadata: { branchId, ...auditMetadata } } })
    return { ...session, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, sellers, onboardingRequired: requiresAdminPinSetup(tenant.settings), scope: 'device:company' as const }
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

/** Company-level session used exclusively for the first-run administrator setup. */
export async function requireCompanySession(request: Request) {
  return companySession(request)
}

export async function authenticateSeller(request: Request, input: PinInput) {
  const parent = await companySession(request)
  const sellerId = String(input.sellerId ?? input.userId ?? '')
  const pin = String(input.pin ?? '')
  if (!parent || !/^\d{4}$/.test(pin)) return null
  const auditMetadata = authRequestMetadata(request)
  type SellerRow = {
    id: string; tenantId: string; name: string; role: string; branchId: string | null; pinHash: string; status: string; permissions: unknown; accessSchedule: unknown; failedLoginAttempts: number; lockedUntil: Date | null
  }
  // El bcrypt es costoso y el $transaction tiene timeout interactivo de 5 s:
  // la búsqueda por PIN (loop sobre los usuarios activos de la empresa) se
  // resuelve FUERA de la transacción, y la transacción solo cubre la
  // mutación final releyendo al usuario con FOR UPDATE.
  let resolvedId: string | null = null
  if (sellerId) {
    const rows = await prisma.$queryRaw<SellerRow[]>`
      SELECT "id", "tenantId", "name", "role", "branchId", "pinHash", "status", "permissions", "accessSchedule", "failedLoginAttempts", "lockedUntil"
      FROM "User"
      WHERE "id" = ${sellerId} AND "tenantId" = ${parent.tenantId} AND "status" = 'ACTIVE'
        AND (${parent.branchId}::text IS NULL OR "branchId" = ${parent.branchId})
        AND ("branchId" IS NULL OR EXISTS (SELECT 1 FROM "Branch" b WHERE b."id" = "User"."branchId" AND b."isActive" = true))
    `
    resolvedId = rows[0]?.id ?? null
  } else {
    // El PIN identifica al vendedor: se prueba contra los usuarios activos
    // de la empresa. Los PINs son únicos por empresa, y ante cualquier
    // duplicado el acceso se rechaza hasta que el administrador asigne
    // PINs distintos: nunca se entra con un PIN ambiguo.
    const candidates = await prisma.user.findMany({
      where: { tenantId: parent.tenantId, status: 'ACTIVE', ...(parent.branchId ? { branchId: parent.branchId } : {}) },
      select: { id: true, pinHash: true },
    })
    const matches: string[] = []
    for (const candidate of candidates) {
      if (await bcrypt.compare(pin, candidate.pinHash)) matches.push(candidate.id)
    }
    if (matches.length > 1) {
      await prisma.auditLog.create({ data: { tenantId: parent.tenantId, action: 'SELLER_PIN_DUPLICATED', entity: 'Tenant', entityId: parent.tenantId, metadata: { count: matches.length, branchId: parent.branchId, ...auditMetadata } } })
      return { duplicated: true }
    }
    if (matches.length === 0) {
      await prisma.auditLog.create({ data: { tenantId: parent.tenantId, action: 'SELLER_PIN_UNKNOWN', entity: 'Tenant', entityId: parent.tenantId, metadata: { branchId: parent.branchId, ...auditMetadata } } })
      return null
    }
    resolvedId = matches[0]
  }
  if (!resolvedId) return null
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<SellerRow[]>`
      SELECT "id", "tenantId", "name", "role", "branchId", "pinHash", "status", "permissions", "accessSchedule", "failedLoginAttempts", "lockedUntil"
      FROM "User"
      WHERE "id" = ${resolvedId} AND "tenantId" = ${parent.tenantId} AND "status" = 'ACTIVE'
        AND (${parent.branchId}::text IS NULL OR "branchId" = ${parent.branchId})
        AND ("branchId" IS NULL OR EXISTS (SELECT 1 FROM "Branch" b WHERE b."id" = "User"."branchId" AND b."isActive" = true))
      FOR UPDATE
    `
    const user = rows[0] ?? null
    if (!user) return null
    const now = new Date()
    if (!isAccessAllowed(user.accessSchedule, now)) {
      await tx.auditLog.create({ data: { tenantId: parent.tenantId, userId: user.id, action: 'SELLER_SCHEDULE_DENIED', entity: 'User', entityId: user.id, metadata: { branchId: parent.branchId, ...auditMetadata } } })
      return null
    }
    const lockExpired = user.lockedUntil !== null && user.lockedUntil <= now
    const attempts = lockExpired ? 0 : user.failedLoginAttempts
    if (lockExpired) await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    if (user.lockedUntil && !lockExpired) {
      await tx.auditLog.create({ data: { tenantId: parent.tenantId, userId: user.id, action: 'SELLER_PIN_BLOCKED', entity: 'User', entityId: user.id, metadata: { branchId: parent.branchId, ...auditMetadata } } })
      return null
    }
    if (!(await bcrypt.compare(pin, user.pinHash))) {
      const failedLoginAttempts = attempts + 1
      const lockedUntil = failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts, lockedUntil } })
      await tx.auditLog.create({ data: { tenantId: parent.tenantId, userId: user.id, action: lockedUntil ? 'SELLER_PIN_LOCKED' : 'SELLER_PIN_FAILED', entity: 'User', entityId: user.id, metadata: { failedLoginAttempts, branchId: parent.branchId, ...auditMetadata } } })
      return null
    }
    await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastAccessAt: now } })
    const session = await createSession(tx, parent.tenantId, user.id, 'SELLER', parent.deviceId, parent.branchId)
    await tx.auditLog.create({ data: { tenantId: parent.tenantId, userId: user.id, action: 'SELLER_PIN_VERIFIED', entity: 'Session', entityId: session.sessionId, metadata: { branchId: parent.branchId, ...auditMetadata } } })
    return { ...session, user: sessionUser(user) }
  })
}

function sessionUser(user: { id: string; tenantId: string; name: string; role: string; branchId: string | null; permissions?: unknown }): AuthUser {
  return { id: user.id, tenantId: user.tenantId, name: user.name, role: user.role, branchId: user.branchId, permissions: effectivePermissions(user.role, user.permissions) }
}

export async function requireSession(request: Request): Promise<SessionContext | null> {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  const cookie = readCookie(request, COOKIE_SELLER)
  if (!match && (!cookie || !sameOrigin(request))) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match ? match[1] : cookie) }, include: { user: true } })
  const now = new Date()
  if (!session || session.level !== 'SELLER' || !session.userId || !session.user || !isSessionUsable({ ...session, user: session.user }, now)) return null
  if (!isAccessAllowed(session.user.accessSchedule, now)) {
    const auditMetadata = authRequestMetadata(request)
    await prisma.$transaction(async tx => {
      const active = await tx.session.findFirst({ where: { id: session.id, revokedAt: null }, select: { id: true } })
      if (!active) return
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } })
      await tx.auditLog.create({ data: { tenantId: session.tenantId, userId: session.userId, action: 'SELLER_SESSION_SCHEDULE_REVOKED', entity: 'Session', entityId: session.id, metadata: auditMetadata } })
    })
    return null
  }
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
  return { sessionId: session.id, user: sessionUser(session.user) }
}

export async function revokeSession(request: Request) {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  const cookies = [readCookie(request, COOKIE_SELLER), readCookie(request, COOKIE_COMPANY)].filter(Boolean)
  if (!match && (!cookies.length || !sameOrigin(request))) return false
  const tokens = match ? [match[1]] : cookies
  const auditMetadata = authRequestMetadata(request)
  const sessions = await prisma.session.findMany({ where: { tokenHash: { in: tokens.map(hashToken) }, revokedAt: null } })
  if (!sessions.length) return false
  await prisma.$transaction(async tx => {
    for (const session of sessions) {
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId: session.tenantId, userId: session.userId, action: 'SESSION_REVOKED', entity: 'Session', entityId: session.id, metadata: { level: session.level, reason: 'logout', ...auditMetadata } } })
    }
  })
  return true
}
