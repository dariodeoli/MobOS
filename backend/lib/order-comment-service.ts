import type { Prisma } from '@prisma/client'
import { canAccessOrder } from './orders'
import { effectivePermissions, hasPermission, isAccessAllowed } from './auth'
import { InputError, textInput } from './payment-input'
import { moduleStoreFrom } from './module-store'

type Db = Pick<Prisma.TransactionClient, 'order' | 'user' | 'tenant' | 'session' | 'mcpClientGrant' | 'mcpAccessToken' | '$queryRaw' | 'auditLog'>
export type OrderCommentActor = { id: string; tenantId: string }
export type OrderCommentBinding = { sessionId: string; grantId: string; tokenId: string; clientId: string; accountId?: string | null }
export class OrderCommentError extends InputError {
  constructor(public code: 'not_found' | 'forbidden' | 'conflict', message: string) { super(message, code === 'not_found' ? 404 : code === 'forbidden' ? 403 : 409) }
}
export function normalizeOrderCommentFields(input: Record<string, unknown>) {
  const fields = {
    ...(input.billingName === undefined ? {} : { billingName: textInput(input.billingName, 'Titular de factura', 200) }),
    ...(input.billingDocument === undefined ? {} : { billingDocument: textInput(input.billingDocument, 'RUC de factura', 100) }),
    ...(input.notes === undefined ? {} : { notes: textInput(input.notes, 'Comentario', 2000) }),
  }
  if (!Object.keys(fields).length) throw new InputError('Datos de factura inválidos.')
  return fields
}
async function clock(db: Db) {
  const rows = await db.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
  const epoch = Number(rows[0]?.nowMs)
  if (!Number.isSafeInteger(epoch) || !Number.isFinite(new Date(epoch).getTime())) throw new Error('Invalid order clock')
  return new Date(epoch)
}

/** Both the web editor and MCP use the same live actor, tenant and order checks. */
export async function readOrderComment(db: Db, actor: OrderCommentActor, orderId: string, binding?: OrderCommentBinding) {
  const now = await clock(db)
  const user = await db.user.findFirst({ where: { id: actor.id, tenantId: actor.tenantId, status: 'ACTIVE' } })
  const tenant = await db.tenant.findFirst({ where: { id: actor.tenantId, archivedAt: null }, select: { settings: true } })
  if (!user || !tenant || !isAccessAllowed(user.accessSchedule, now) || moduleStoreFrom(tenant.settings).modules.ventas?.enabled !== true) throw new OrderCommentError('forbidden', 'La sesión no puede editar el pedido.')
  const permissions = effectivePermissions(user.role, user.permissions)
  if (binding) {
    const session = await db.session.findFirst({ where: { id: binding.sessionId, tenantId: actor.tenantId, userId: actor.id, level: 'SELLER', revokedAt: null, expiresAt: { gt: now } } })
    const grant = await db.mcpClientGrant.findFirst({ where: { id: binding.grantId, tenantId: actor.tenantId, userId: actor.id, clientId: binding.clientId, revokedAt: null, scopes: { has: 'sales:write' } } })
    const token = await db.mcpAccessToken.findFirst({ where: { id: binding.tokenId, grantId: binding.grantId, sessionId: binding.sessionId, tenantId: actor.tenantId, userId: actor.id, revokedAt: null, expiresAt: { gt: now }, scopes: { has: 'sales:write' } } })
    if (!session || !grant || !token || (binding.accountId && session.accountId !== binding.accountId) || !hasPermission({ permissions }, 'orders:manage')) throw new OrderCommentError('forbidden', 'La conexión no puede editar el pedido.')
  }
  const order = await db.order.findFirst({ where: { id: orderId, tenantId: actor.tenantId, ...(binding ? { archivedAt: null } : {}) }, select: { id: true, tenantId: true, sellerId: true, branchId: true, status: true, notes: true, billingName: true, billingDocument: true, updatedAt: true } })
  if (!order || !canAccessOrder(user, order)) throw new OrderCommentError('not_found', 'Pedido no encontrado.')
  if (order.status === 'CANCELLED') throw new OrderCommentError('conflict', 'Un pedido cancelado no admite cambios.')
  return { order, now }
}

/** Must run in the caller's transaction, including the preview claim/audit. */
export async function updateOrderComment(db: Db, actor: OrderCommentActor, orderId: string, input: Record<string, unknown>, options: { expectedUpdatedAt?: string; binding?: OrderCommentBinding } = {}) {
  const fields = normalizeOrderCommentFields(input)
  if (options.binding && (typeof options.expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(options.expectedUpdatedAt)))) throw new OrderCommentError('conflict', 'La vista previa no tiene versión válida.')
  if (options.binding && (fields.notes === undefined || Object.keys(fields).some(key => key !== 'notes'))) throw new InputError('El conector sólo puede editar el comentario de la venta.')
  const { order, now } = await readOrderComment(db, actor, orderId, options.binding)
  if (options.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== order.updatedAt.toISOString()) throw new OrderCommentError('conflict', 'La venta cambió después de la vista previa.')
  const updatedAt = new Date(Math.max(now.getTime(), order.updatedAt.getTime() + 1))
  const claimed = await db.order.updateMany({ where: { id: order.id, tenantId: actor.tenantId, updatedAt: order.updatedAt, status: { not: 'CANCELLED' } }, data: { ...fields, updatedAt } })
  if (claimed.count !== 1) throw new OrderCommentError('conflict', 'La venta cambió después de la vista previa.')
  // updateMany may wait on an Order row lock: revalidate live authorization after that wait.
  if (options.binding) await readOrderComment(db, actor, orderId, options.binding)
  const updated = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { id: true, notes: true, billingName: true, billingDocument: true, updatedAt: true } })
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'ORDER_BILLING_UPDATED', entity: 'Order', entityId: order.id, metadata: { billingName: updated.billingName, hasDocument: Boolean(updated.billingDocument) } } })
  return updated
}
