import { USER_ROLES, requireAccountContext, requireSession } from './auth'
import { prisma } from './prisma'
import { InputError } from './payment-input'

export const VERIFICATION_RECORDS = ['condition', 'battery', 'notes'] as const
export type VerificationPolicy = { roles: string[]; records: string[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Ausencia conserva el contrato anterior. Una lista vacía deshabilita nuevos checks, nunca la auditoría. */
export function verificationPolicy(value: unknown): VerificationPolicy {
  const raw = record(value)
  return {
    roles: Array.isArray(raw.roles) ? [...new Set(raw.roles.filter((v): v is string => typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v)))] : [...USER_ROLES],
    records: Array.isArray(raw.records) ? [...new Set(raw.records.filter((v): v is string => typeof v === 'string' && (VERIFICATION_RECORDS as readonly string[]).includes(v)))] : [],
  }
}
export function policyFromSettings(settings: unknown) { return verificationPolicy(record(settings).stockVerification) }
export function canVerify(policy: VerificationPolicy, role: string) { return policy.roles.includes(role) }
export function verificationSnapshot(policy: VerificationPolicy, unit: { condition: unknown; batteryHealth: number | null; batteryCycles: number | null; notes: string | null }) {
  return {
    ...(policy.records.includes('condition') ? { condition: String(unit.condition) } : {}),
    ...(policy.records.includes('battery') ? { batteryHealth: unit.batteryHealth, batteryCycles: unit.batteryCycles } : {}),
    ...(policy.records.includes('notes') ? { notes: unit.notes } : {}),
  }
}
export async function readVerificationPolicy(db: Pick<typeof prisma, 'tenant'>, tenantId: string) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  return policyFromSettings(tenant?.settings)
}
export function assertCanVerify(policy: VerificationPolicy, role: string) {
  if (!canVerify(policy, role)) throw new InputError('Tu rol no está autorizado para verificar stock. Consultá al dueño.', 403)
}
/** Cuenta propietaria vinculada al perfil activo; ADMIN/GERENTE no acreditan propiedad. */
export async function verificationOwner(request: Request, session: NonNullable<Awaited<ReturnType<typeof requireSession>>>) {
  const context = await requireAccountContext(request)
  if (!context || context.tenantId !== session.user.tenantId || context.sellerUserId !== session.user.id) return false
  return Boolean(await prisma.tenantMembership.findFirst({ where: { accountId: context.accountId, tenantId: session.user.tenantId, userId: session.user.id, role: 'OWNER', revokedAt: null }, select: { id: true } }))
}
