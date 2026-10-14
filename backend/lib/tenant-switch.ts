import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import {
  ArchivedTenantError,
  authRequestMetadata,
  consumeAuthAttemptWindow,
  createSession,
  enforceAuthRateLimit,
  hashToken,
  isAccessAllowed,
  requiresAdminPinSetup,
  type AccountContext,
} from './auth'
import { assertMembership, ensureMembership, MembershipError } from './membership'
import { canCreateCompany, shouldKeepSeller } from './membership-rules'

export class TenantSwitchError extends Error {
  constructor(public status: number, message: string, public code = 'TENANT_SWITCH_DENIED') { super(message) }
}

const WINDOW_MS = 15 * 60 * 1000
const CREATE_WINDOW_MS = 60 * 60 * 1000
const SWITCH_MAX = 30
const CREATE_MAX = 3

export type SwitchResult = {
  accessToken: string
  expiresAt: Date
  sellerToken: string | null
  tenant: { id: string; name: string; slug: string }
  sellers: Array<{ id: string; name: string; branchId: string | null; pinLength: number | null }>
  user: { id: string; name: string; role: string; branchId: string | null } | null
  onboardingRequired: boolean
  scope: 'device:company'
}

async function limit(request: Request, ctx: AccountContext, scope: string, max: number, windowMs: number) {
  await enforceAuthRateLimit(request, scope, max, windowMs)
  // Además del IP, un tope por cuenta: no depende de que el proxy declare la IP.
  await prisma.$transaction(tx => consumeAuthAttemptWindow(tx, `${scope}-account`, hashToken(`${scope}:${ctx.accountId}`), max, windowMs))
}

async function sellersOf(tx: any, tenantId: string) {
  return tx.user.findMany({
    where: { tenantId, status: 'ACTIVE', OR: [{ branchId: null }, { branch: { isActive: true } }] },
    select: { id: true, name: true, branchId: true, pinLength: true },
    orderBy: { name: 'asc' },
  }) as Promise<SwitchResult['sellers']>
}

async function deny(ctx: AccountContext, request: Request, targetTenantId: string, reason: string): Promise<never> {
  await prisma.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.sellerUserId, action: 'TENANT_SWITCH_DENIED', entity: 'Tenant', entityId: targetTenantId.slice(0, 200), metadata: { reason, ...authRequestMetadata(request) } } }).catch(() => undefined)
  throw new TenantSwitchError(403, 'No tenés acceso a esa empresa.')
}

/** Revoca las sesiones presentadas y abre las de la empresa destino en una sola transacción. */
export async function openTenant(tx: any, ctx: AccountContext, request: Request, membership: { id: string; userId: string | null }, targetTenantId: string, extraAudit: Record<string, unknown> = {}, allowSeller = true): Promise<SwitchResult> {
  const now = new Date()
  const metadata = authRequestMetadata(request)
  // Si otra solicitud ya revocó alguna de estas sesiones (doble envío, carrera),
  // se aborta: la transacción entera se deshace y no se abre ninguna sesión nueva.
  const revoked = await tx.session.updateMany({ where: { id: { in: ctx.sessionIds }, revokedAt: null }, data: { revokedAt: now } })
  if (revoked.count !== ctx.sessionIds.length) throw new TenantSwitchError(409, 'La sesión cambió mientras se procesaba el cambio. Intentá nuevamente.', 'TENANT_SWITCH_RACE')
  await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.sellerUserId, action: 'TENANT_SWITCH_OUT', entity: 'Tenant', entityId: targetTenantId, metadata: { toTenantId: targetTenantId, ...metadata } } })
  const company = await createSession(tx, targetTenantId, null, 'COMPANY', ctx.deviceId, null, { userAgent: ctx.userAgent, accountId: ctx.accountId })
  // La sesión de vendedor del destino solo se abre si quien cambia es el perfil
  // vinculado a la cuenta; si no, la app muestra la pantalla de PIN.
  const linkedFrom = await tx.tenantMembership.findUnique({ where: { accountId_tenantId: { accountId: ctx.accountId, tenantId: ctx.tenantId } }, select: { userId: true } })
  let seller: Awaited<ReturnType<typeof createSession>> | null = null
  let user: SwitchResult['user'] = null
  if (allowSeller && shouldKeepSeller(ctx.sellerUserId, linkedFrom?.userId ?? null) && membership.userId) {
    const target = await tx.user.findFirst({ where: { id: membership.userId, tenantId: targetTenantId, status: 'ACTIVE', OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, role: true, branchId: true, accessSchedule: true } })
    if (target && isAccessAllowed(target.accessSchedule, now)) {
      seller = await createSession(tx, targetTenantId, target.id, 'SELLER', ctx.deviceId, null, { userAgent: ctx.userAgent, accountId: ctx.accountId })
      user = { id: target.id, name: target.name, role: target.role, branchId: target.branchId }
    }
  }
  await tx.tenantMembership.update({ where: { id: membership.id }, data: { lastUsedAt: now } })
  await tx.auditLog.create({ data: { tenantId: targetTenantId, userId: user?.id ?? null, action: 'TENANT_SWITCH_IN', entity: 'Session', entityId: company.sessionId, metadata: { fromTenantId: ctx.tenantId, sellerSession: !!seller, ...extraAudit, ...metadata } } })
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: targetTenantId }, select: { id: true, name: true, slug: true, settings: true } })
  return {
    accessToken: company.accessToken,
    expiresAt: company.expiresAt,
    sellerToken: seller?.accessToken ?? null,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    sellers: await sellersOf(tx, targetTenantId),
    user,
    onboardingRequired: requiresAdminPinSetup(tenant.settings),
    scope: 'device:company',
  }
}

export async function switchTenant(request: Request, ctx: AccountContext, targetTenantId: string): Promise<SwitchResult> {
  await limit(request, ctx, 'tenant-switch', SWITCH_MAX, WINDOW_MS)
  if (!targetTenantId || targetTenantId.length > 200) return deny(ctx, request, 'invalid', 'invalid_id')
  if (targetTenantId === ctx.tenantId) throw new TenantSwitchError(409, 'Ya estás en esa empresa.', 'TENANT_SWITCH_SAME')
  let membership
  try {
    membership = await assertMembership(prisma, ctx.accountId, targetTenantId)
  } catch (cause) {
    if (cause instanceof MembershipError) return deny(ctx, request, targetTenantId, cause.code.toLowerCase())
    throw cause
  }
  try {
    return await prisma.$transaction(tx => openTenant(tx, ctx, request, membership, targetTenantId))
  } catch (cause) {
    if (cause instanceof ArchivedTenantError) return deny(ctx, request, targetTenantId, 'archived')
    throw cause
  }
}

/** Crea una empresa nueva para la cuenta (OWNER) y entra en ella. */
export async function createCompany(request: Request, ctx: AccountContext, companyNameInput: unknown): Promise<SwitchResult> {
  const companyName = typeof companyNameInput === 'string' ? companyNameInput.trim() : ''
  if (!companyName || companyName.length > 100) throw new TenantSwitchError(400, 'Completá el nombre de la empresa.', 'COMPANY_NAME')
  const current = await assertMembership(prisma, ctx.accountId, ctx.tenantId).catch(() => null)
  // Quien actúa tiene que ser el perfil vinculado de una pertenencia OWNER y
  // ese perfil seguir siendo ADMIN activo AHORA (no el rol de cuando se vinculó).
  if (!current || !ctx.sellerUserId || current.userId !== ctx.sellerUserId || !canCreateCompany(current.role, current.user)) throw new TenantSwitchError(403, 'Solo el dueño puede crear otra empresa.', 'COMPANY_CREATE_FORBIDDEN')
  await limit(request, ctx, 'company-create', CREATE_MAX, CREATE_WINDOW_MS)
  const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId }, select: { email: true } })
  const pinHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
  return prisma.$transaction(async tx => {
    // Como el alta con Google: empresa sin correo propio, ADMIN con PIN
    // inutilizable y alta de PIN pendiente (adminPinPending).
    const tenant = await tx.tenant.create({ data: { name: companyName, email: null, slug: `tienda-${randomBytes(16).toString('hex')}`, settings: { onboarding: { adminPinPending: true, source: 'account' } } } })
    const admin = await tx.user.create({ data: { tenantId: tenant.id, name: current.user?.name?.slice(0, 100) || 'Administrador', email: account.email ?? current.user?.email ?? null, pinHash, role: 'ADMIN' } })
    const membership = await ensureMembership(tx, { accountId: ctx.accountId, tenantId: tenant.id, userId: admin.id, role: 'OWNER' })
    await tx.auditLog.create({ data: { tenantId: tenant.id, userId: admin.id, action: 'TENANT_COMPANY_CREATED', entity: 'Tenant', entityId: tenant.id, metadata: { fromTenantId: ctx.tenantId, ...authRequestMetadata(request) } } })
    return openTenant(tx, ctx, request, membership, tenant.id, { created: true }, false)
  })
}
