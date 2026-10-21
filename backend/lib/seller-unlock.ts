import bcrypt from 'bcryptjs'
import type { Session, User } from '@prisma/client'
import { AuthRateLimitError, consumeAuthAttemptWindow, effectivePermissions, hashToken, isAccessAllowed, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from './auth'
import { COOKIE_SELLER, readCookie, sameOrigin } from './google-oauth'
import { prisma } from './prisma'

export class UnlockInputError extends Error {
  constructor(public status: number) { super('Solicitud de desbloqueo inválida.') }
}

/** A PIN-only body, bounded even when Content-Length is missing or false. */
export async function readUnlockPin(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new UnlockInputError(415)
  const advertised = Number(request.headers.get('content-length'))
  if (Number.isFinite(advertised) && advertised > 1024) throw new UnlockInputError(413)
  const reader = request.body?.getReader()
  if (!reader) throw new UnlockInputError(400)
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new UnlockInputError(408)); void reader.cancel().catch(() => {}) }, 2000)
  })
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline])
      if (done) break
      size += value.byteLength
      if (size > 1024) { await reader.cancel(); throw new UnlockInputError(413) }
      chunks.push(value)
    }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => key !== 'pin') || typeof body.pin !== 'string' || !/^\d{4,6}$/.test(body.pin)) throw new UnlockInputError(400)
    return body.pin as string
  } catch (cause) {
    if (cause instanceof UnlockInputError) throw cause
    throw new UnlockInputError(400)
  } finally { clearTimeout(timer); reader.releaseLock() }
}

/**
 * Confirms only the current SELLER. No company context, token issuance, TTL
 * renewal or operator selection: /auth/pin remains the company sign-in flow.
 */
export async function unlockCurrentSeller(request: Request, pin: string) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  const cookie = readCookie(request, COOKIE_SELLER)
  if (!bearer && (!cookie || !sameOrigin(request))) return { kind: 'session' as const }
  const token = bearer ? bearer[1] : cookie
  if (!/^[a-f0-9]{64}$/i.test(token) || !/^\d{4,6}$/.test(pin)) return { kind: 'session' as const }
  const tokenHash = hashToken(token)
  const candidate = await prisma.session.findUnique({ where: { tokenHash }, select: { id: true, userId: true, tenantId: true, level: true } })
  if (!candidate?.userId || candidate.level !== 'SELLER') return { kind: 'session' as const }
  return prisma.$transaction(async tx => {
    // Same lock order as user-management updates (user, then its sessions).
    const users = await tx.$queryRaw<User[]>`SELECT * FROM "User" WHERE "id" = ${candidate.userId} AND "tenantId" = ${candidate.tenantId} FOR UPDATE`
    const sessions = await tx.$queryRaw<Session[]>`SELECT * FROM "Session" WHERE "id" = ${candidate.id} AND "tokenHash" = ${tokenHash} AND "level" = 'SELLER' AND "userId" = ${candidate.userId} AND "tenantId" = ${candidate.tenantId} FOR UPDATE`
    const clocks = await tx.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
    const epochMs = Number(clocks[0]?.nowMs)
    if (!Number.isSafeInteger(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) throw new Error('Invalid unlock clock')
    const now = new Date(epochMs)
    const user = users[0], session = sessions[0]
    if (!user || !session || session.revokedAt || session.expiresAt <= now || user.status !== 'ACTIVE') return { kind: 'session' as const }
    // Match requireSession: a request outside the access schedule revokes
    // this credential, rather than letting a later PIN bypass that revocation.
    if (!isAccessAllowed(user.accessSchedule, now)) {
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } })
      await tx.auditLog.create({ data: { tenantId: session.tenantId, userId: user.id, action: 'SELLER_SESSION_SCHEDULE_REVOKED', entity: 'Session', entityId: session.id, metadata: { reason: 'self-unlock' } } })
      return { kind: 'session' as const }
    }
    const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId }, select: { archivedAt: true } })
    if (!tenant || tenant.archivedAt) return { kind: 'session' as const }
    if (user.branchId && session.branchId && user.branchId !== session.branchId) return { kind: 'session' as const }
    for (const id of new Set([session.branchId, user.branchId].filter((id): id is string => Boolean(id)))) {
      if (!await tx.branch.findFirst({ where: { id, tenantId: session.tenantId, isActive: true }, select: { id: true } })) return { kind: 'session' as const }
    }
    if (session.accountId) {
      // The account must still be linked to this very operator, not merely
      // retain another person's membership in the same company.
      const membership = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TenantMembership" WHERE "accountId" = ${session.accountId} AND "tenantId" = ${session.tenantId} AND "userId" = ${user.id} AND "revokedAt" IS NULL FOR SHARE`
      if (!membership.length) return { kind: 'session' as const }
    }
    // Match /auth/me's canonical identity (#286): for an unassigned/global
    // user the last-used branch wins. Session.branchId is company-login
    // context, not a substitute assignment for such a user. Validate that
    // legacy context above, but never create/assign/record branch usage here.
    let branchId = user.branchId
    if (!branchId) branchId = (await tx.userBranchUsage.findFirst({ where: { tenantId: session.tenantId, userId: user.id, branch: { isActive: true } }, orderBy: { usedAt: 'desc' }, select: { branchId: true } }))?.branchId || null
    if (!branchId) branchId = (await tx.branch.findFirst({ where: { tenantId: session.tenantId, isActive: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }))?.id || null
    // Per-session budget is mandatory even when no trusted proxy IP is present.
    await consumeAuthAttemptWindow(tx, 'seller-unlock', hashToken(`unlock:${session.id}`), 20, 15 * 60 * 1000, now)
    const expiredLock = user.lockedUntil !== null && user.lockedUntil <= now
    const attempts = expiredLock ? 0 : user.failedLoginAttempts
    if (user.lockedUntil && !expiredLock) return { kind: 'limited' as const, retryAfterSeconds: Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000)) }
    if (!await bcrypt.compare(pin, user.pinHash)) {
      const failedLoginAttempts = attempts + 1
      const lockedUntil = failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts, lockedUntil } })
      await tx.auditLog.create({ data: { tenantId: session.tenantId, userId: user.id, action: lockedUntil ? 'SELLER_PIN_LOCKED' : 'SELLER_PIN_FAILED', entity: 'User', entityId: user.id, metadata: { reason: 'self-unlock', sessionId: session.id } } })
      if (lockedUntil) return { kind: 'limited' as const, retryAfterSeconds: LOCKOUT_MINUTES * 60 }
      return { kind: 'pin' as const }
    }
    await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastAccessAt: now } })
    await tx.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
    await tx.auditLog.create({ data: { tenantId: session.tenantId, userId: user.id, action: 'SELLER_SESSION_UNLOCKED', entity: 'Session', entityId: session.id, metadata: { branchId: session.branchId } } })
    return { kind: 'ok' as const, user: { id: user.id, tenantId: user.tenantId, name: user.name, role: user.role, branchId, pinLength: user.pinLength, permissions: effectivePermissions(user.role, user.permissions) } }
  }, { maxWait: 10_000, timeout: 10_000 })
}

export { AuthRateLimitError }
