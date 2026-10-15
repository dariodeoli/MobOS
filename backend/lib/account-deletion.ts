import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'

// Borrar mi cuenta. Un integrante se desvincula de todas sus
// tiendas, se cierran sus sesiones y se anonimiza lo personal; los registros del
// negocio (ventas, cobros, comentarios) se conservan con el nombre anonimizado.
// El dueño de una tienda no puede borrarse solo: primero transfiere o elimina
// la tienda (flujo purgeStore de Configuración).

export const ANONYMIZED_NAME = 'Usuario eliminado'
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export class DeletionError extends Error {
  constructor(public code: 'REAUTH_REQUIRED' | 'REAUTH_FAILED' | 'REAUTH_LOCKED' | 'OWNER_MUST_TRANSFER_OR_DELETE_STORE', message: string, public status: number, public details?: unknown) { super(message) }
}

export type DeletionContext = { userId: string; tenantId: string; accountId: string | null }

/**
 * Reautenticación obligatoria: PIN del usuario, contraseña de la empresa
 * (solo ADMIN) .
 * Cualquier fallo responde igual para no revelar cuál dato era el incorrecto.
 */
export async function verifyDeletionReauth(ctx: DeletionContext, body: Record<string, unknown>) {
  const fail = () => new DeletionError('REAUTH_FAILED', 'No se pudo confirmar tu identidad.', 401)
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, role: true, pinHash: true, failedLoginAttempts: true, lockedUntil: true, tenant: { select: { passwordHash: true } } } })
  if (!user) throw fail()
  const pin = typeof body.pin === 'string' ? body.pin : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!pin && !password) throw new DeletionError('REAUTH_REQUIRED', 'Confirmá tu identidad con tu PIN o tu contraseña.', 400)

  const now = new Date()
  if (user.lockedUntil && user.lockedUntil > now) throw new DeletionError('REAUTH_LOCKED', 'Demasiados intentos. Esperá unos minutos e intentá nuevamente.', 429)
  let ok = false
  if (pin) ok = await bcrypt.compare(pin, user.pinHash)
  else if (user.role === 'ADMIN' && user.tenant.passwordHash) ok = await bcrypt.compare(password, user.tenant.passwordHash)
  if (!ok) {
    const attempts = (user.lockedUntil && user.lockedUntil <= now ? 0 : user.failedLoginAttempts) + 1
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null } })
    throw fail()
  }
  if (user.failedLoginAttempts) await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
}

/** Perfiles (User) de la persona: el de la sesión y los vinculados a su cuenta en otras tiendas. */
async function personProfiles(ctx: DeletionContext) {
  const memberships = ctx.accountId ? await prisma.tenantMembership.findMany({ where: { accountId: ctx.accountId }, select: { tenantId: true, userId: true, role: true, revokedAt: true } }) : []
  const userIds = new Set([ctx.userId, ...memberships.map(row => row.userId).filter((id): id is string => !!id)])
  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, tenantId: true, role: true, status: true, email: true } })
  return { memberships, users }
}

/** Tiendas que el usuario aún "tiene": dueño o único administrador. Vacío = puede borrarse. */
export async function ownedStores(ctx: DeletionContext) {
  const { memberships, users } = await personProfiles(ctx)
  const tenantIds = new Set<string>()
  for (const row of memberships) if (!row.revokedAt && row.role === 'OWNER') tenantIds.add(row.tenantId)
  if (ctx.accountId) {
    const account = await prisma.account.findUnique({ where: { id: ctx.accountId }, select: { googleSubject: true } })
    if (account?.googleSubject) {
      const owned = await prisma.googleStoreAccess.findMany({ where: { subject: account.googleSubject, owner: true }, select: { tenantId: true } })
      for (const row of owned) tenantIds.add(row.tenantId)
    }
  }
  // Último administrador activo de una tienda: sin él la tienda queda huérfana.
  for (const user of users) {
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE') continue
    const others = await prisma.user.count({ where: { tenantId: user.tenantId, role: 'ADMIN', status: 'ACTIVE', id: { notIn: users.map(item => item.id) } } })
    if (!others) tenantIds.add(user.tenantId)
  }
  if (!tenantIds.size) return []
  return prisma.tenant.findMany({ where: { id: { in: [...tenantIds] }, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}

export type DeletionResult = { deletedAt: Date; profiles: number; accountDeleted: boolean }

export async function deletePersonalAccount(ctx: DeletionContext): Promise<DeletionResult> {
  const stores = await ownedStores(ctx)
  if (stores.length) throw new DeletionError('OWNER_MUST_TRANSFER_OR_DELETE_STORE', 'Sos dueño o único administrador de una tienda. Transferila o eliminala antes de borrar tu cuenta.', 409, { stores })

  const { users } = await personProfiles(ctx)
  const userIds = users.map(user => user.id)
  const emails = [...new Set(users.map(user => user.email?.trim().toLowerCase()).filter((email): email is string => !!email))]
  const account = ctx.accountId ? await prisma.account.findUnique({ where: { id: ctx.accountId }, select: { id: true, email: true, googleSubject: true} }) : null
  if (account?.email && !emails.includes(account.email)) emails.push(account.email)
  // El PIN anonimizado es un valor aleatorio: la fila queda inutilizable para ingresar.
  const deadPin = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
  const now = new Date()

  await prisma.$transaction(async tx => {
    await tx.session.updateMany({ where: { OR: [{ userId: { in: userIds } }, ...(account ? [{ accountId: account.id }] : [])], revokedAt: null }, data: { revokedAt: now } })
    await tx.webPushSubscription.deleteMany({ where: { userId: { in: userIds } } })
    await tx.userAvatar.deleteMany({ where: { userId: { in: userIds } } })
    if (emails.length) await tx.userInvitation.deleteMany({ where: { email: { in: emails }, consumedAt: null, revokedAt: null } })
    // Anonimiza el perfil en cada tienda: las ventas y cobros siguen apuntando a
    // la fila, que ahora se lee «Usuario eliminado».
    await tx.user.updateMany({ where: { id: { in: userIds } }, data: { name: ANONYMIZED_NAME, email: null, pinHash: deadPin, pinLength: null, status: 'INACTIVE', dailyGoalPyg: null, failedLoginAttempts: 0, lockedUntil: null } })
    if (account) {
      if (account.googleSubject) {
        await tx.googleStoreAccess.deleteMany({ where: { subject: account.googleSubject } })
        await tx.googleIdentity.deleteMany({ where: { subject: account.googleSubject } })
      }
      // Cascada: pertenencias de la cuenta.
      await tx.account.delete({ where: { id: account.id } })
    }
    for (const user of users) {
      await tx.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, action: 'ACCOUNT_DELETED_SELF', entity: 'User', entityId: user.id, metadata: { selfService: true, profiles: users.length, accountDeleted: !!account } } })
    }
  })

  return { deletedAt: now, profiles: users.length, accountDeleted: !!account }
}
