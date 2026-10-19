import { prisma } from './prisma'
import { requireAccountContext, requireSession } from './auth'
import { canManageDelivery, canUseDelivery } from './delivery'
import { InputError } from './payment-input'
import { error } from './http'
import { tenantModuleEnabled } from './tenant-module-access'

export async function assertDeliveryModule(tenantId: string) {
  if (!await tenantModuleEnabled(tenantId, 'delivery')) throw new InputError('El módulo Delivery está desactivado para esta empresa.', 403)
}
export async function deliveryModuleEnabled(tenantId: string) { return tenantModuleEnabled(tenantId, 'delivery') }

export async function deliveryAccess(request: Request, ownerOnly = false) {
  const session = await requireSession(request)
  if (!session) throw new InputError('Falta sesión.', 401)
  await assertDeliveryModule(session.user.tenantId)
  // La contraseña compartida o un ADMIN no prueban que sea el dueño real.
  const account = session.accountId ? await requireAccountContext(request) : null
  const membership = account && account.tenantId === session.user.tenantId && account.sellerUserId === session.user.id
    ? await prisma.tenantMembership.findFirst({ where: { tenantId: account.tenantId, accountId: account.accountId, userId: session.user.id, role: 'OWNER', revokedAt: null }, select: { id: true } }) : null
  const owner = Boolean(membership)
  if (ownerOnly && !owner) throw new InputError('Solo el dueño de la empresa puede realizar esta acción.', 403)
  if (!owner && !canManageDelivery(session.user) && !canUseDelivery(session.user)) throw new InputError('No autorizado.', 403)
  return { tenantId: session.user.tenantId, userId: session.user.id, user: session.user, owner, driverOnly: !owner && canUseDelivery(session.user) && !canManageDelivery(session.user) }
}
export type DeliveryActor = Awaited<ReturnType<typeof deliveryAccess>>
export function branchScope(actor: DeliveryActor, branchId?: string) {
  if (!actor.owner && (!actor.user.branchId || (branchId && branchId !== actor.user.branchId))) throw new InputError('La sucursal está fuera de tu alcance.', 403)
  return actor.owner ? branchId : actor.user.branchId as string
}
export function deliveryFailure(cause: unknown) {
  if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'P2002') return error('La clave de operación ya fue utilizada. Actualizá antes de reintentar.', 409)
  if (!(cause instanceof InputError)) console.error('[delivery-operations]', cause)
  return error(cause instanceof InputError ? cause.message : 'No se pudo completar la operación de reparto.', cause instanceof InputError ? cause.status : 500)
}

export async function deliveryBody(request: Request): Promise<unknown> {
  try { return await request.json() } catch { throw new InputError('El cuerpo debe ser JSON válido.') }
}
