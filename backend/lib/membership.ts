import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { linkedUserBelongs, normalizeAccountEmail, passwordAccountDecision, roleForGoogleAccess, type MembershipRoleName } from './membership-rules'

type Db = Prisma.TransactionClient | typeof prisma

export class MembershipError extends Error {
  constructor(public code: 'NOT_MEMBER' | 'REVOKED' | 'ARCHIVED' | 'INVALID_LINK', message = 'No tenés acceso a esa empresa.') {
    super(message)
  }
}

/** Un perfil (User) solo puede vincularse a la pertenencia de SU empresa. */
export async function assertLinkedUserInTenant(db: Db, userId: string | null | undefined, tenantId: string) {
  if (!userId) return
  const user = await db.user.findUnique({ where: { id: userId }, select: { tenantId: true } })
  if (!user || !linkedUserBelongs(user, tenantId)) throw new MembershipError('INVALID_LINK', 'El perfil vinculado no pertenece a esa empresa.')
}

/** Perfil de la persona en la empresa: ADMIN con su correo; si no, el ADMIN más antiguo (activos primero). */
export async function defaultLinkedUser(db: Db, tenantId: string, email: string | null) {
  const admins = await db.user.findMany({ where: { tenantId, role: 'ADMIN' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, email: true, status: true } })
  const rank = (user: { email: string | null; status: string }) => (email && user.email?.toLowerCase() === email ? 0 : 2) + (user.status === 'ACTIVE' ? 0 : 1)
  return [...admins].sort((a, b) => rank(a) - rank(b))[0]?.id ?? null
}

/** Crea la pertenencia si no existe. Nunca revive una revocada ni pisa el rol existente. */
export async function ensureMembership(db: Db, input: { accountId: string; tenantId: string; userId: string | null; role: MembershipRoleName }) {
  await assertLinkedUserInTenant(db, input.userId, input.tenantId)
  return db.tenantMembership.upsert({
    where: { accountId_tenantId: { accountId: input.accountId, tenantId: input.tenantId } },
    update: {},
    create: { accountId: input.accountId, tenantId: input.tenantId, userId: input.userId, role: input.role },
  })
}

/**
 * Cuenta de quien entra con la contraseña de una empresa. La contraseña prueba
 * el control de la empresa, nunca del correo: una cuenta ajena no se hereda por
 * coincidir el correo (ver passwordAccountDecision). Devuelve null cuando la
 * sesión debe quedar sin cuenta (pertenencia revocada o cuenta con historia).
 */
export async function accountForTenantPassword(tx: Prisma.TransactionClient, tenant: { id: string; email: string | null }) {
  const email = normalizeAccountEmail(tenant.email)
  if (!email) return null
  const existing = await tx.account.findUnique({ where: { email }, include: { memberships: { select: { tenantId: true, revokedAt: true } } } })
  const decision = passwordAccountDecision(existing, tenant.id)
  if (decision === 'revoked' || decision === 'refuse') return null
  const account = existing ?? await tx.account.upsert({ where: { email }, update: {}, create: { email } })
  if (decision === 'create' || decision === 'attach') {
    await ensureMembership(tx, { accountId: account.id, tenantId: tenant.id, userId: await defaultLinkedUser(tx, tenant.id, email), role: 'OWNER' })
  }
  return account.id
}

/** Cuenta de la persona Google (se identifica solo por su subject, nunca por correo). */
export async function accountForGoogle(tx: Prisma.TransactionClient, subject: string) {
  return tx.account.upsert({ where: { googleSubject: subject }, update: {}, create: { googleSubject: subject } })
}

/** Doble escritura: cada GoogleStoreAccess tiene su pertenencia (sin revivir las revocadas). */
export async function syncGoogleMemberships(tx: Prisma.TransactionClient, accountId: string, subject: string, email: string | null) {
  const accesses = await tx.googleStoreAccess.findMany({ where: { subject }, select: { tenantId: true, owner: true } })
  for (const access of accesses) {
    await ensureMembership(tx, { accountId, tenantId: access.tenantId, userId: await defaultLinkedUser(tx, access.tenantId, normalizeAccountEmail(email)), role: roleForGoogleAccess(access.owner) })
  }
}

/** Pertenencia activa del cuenta en la empresa o un error tipado. */
export async function assertMembership(db: Db, accountId: string, tenantId: string, { allowArchived = false }: { allowArchived?: boolean } = {}) {
  const membership = await db.tenantMembership.findUnique({
    where: { accountId_tenantId: { accountId, tenantId } },
    include: { tenant: { select: { id: true, name: true, slug: true, archivedAt: true, settings: true } }, user: { select: { id: true, tenantId: true, name: true, email: true, status: true } } },
  })
  if (!membership) throw new MembershipError('NOT_MEMBER')
  if (membership.revokedAt) throw new MembershipError('REVOKED')
  if (!allowArchived && membership.tenant.archivedAt) throw new MembershipError('ARCHIVED', 'Esta empresa está archivada.')
  if (!linkedUserBelongs(membership.user, tenantId)) throw new MembershipError('INVALID_LINK', 'El perfil vinculado no pertenece a esa empresa.')
  return membership
}

export async function hasActiveMembership(db: Db, accountId: string, tenantId: string) {
  return !!(await db.tenantMembership.findFirst({ where: { accountId, tenantId, revokedAt: null }, select: { id: true } }))
}

/** Empresas activas de la cuenta, para el selector. */
export async function listTenantsForAccount(accountId: string, currentTenantId: string | null) {
  const rows = await prisma.tenantMembership.findMany({
    where: { accountId, revokedAt: null, tenant: { archivedAt: null } },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map(row => ({ id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug, role: row.role, current: row.tenant.id === currentTenantId }))
}

/** Revoca las pertenencias de un perfil (salir de la tienda / baja) ANTES de borrarlo: el FK lo dejaría en null. */
export async function revokeMembershipsForUser(tx: Prisma.TransactionClient, tenantId: string, userId: string, now = new Date()) {
  const rows = await tx.tenantMembership.findMany({ where: { tenantId, userId, revokedAt: null }, select: { id: true, accountId: true } })
  if (!rows.length) return []
  await tx.tenantMembership.updateMany({ where: { id: { in: rows.map(row => row.id) } }, data: { revokedAt: now } })
  await tx.session.updateMany({ where: { tenantId, accountId: { in: rows.map(row => row.accountId) }, revokedAt: null }, data: { revokedAt: now } })
  return rows.map(row => row.accountId)
}

export async function revokeAllMembershipsOfAccount(tx: Prisma.TransactionClient, accountId: string, now = new Date()) {
  await tx.tenantMembership.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: now } })
  await tx.session.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: now } })
}
