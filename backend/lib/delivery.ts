import type { AuthUser } from './auth'
import { InputError } from './payment-input'

// Delivery propio: pre-cobro en la calle y rendición en la tienda.
//
// El repartidor no cobra contra el pedido como un vendedor: registra un
// pre-cobro que nace PENDING, viaja en una rendición y recién queda CONFIRMED
// cuando la tienda la verifica. Hasta ese momento el dinero no entra a caja ni
// cierra el saldo del pedido.

/** Medios que el repartidor puede cobrar en la calle. */
export const DELIVERY_METHODS = ['CASH', 'TRANSFER'] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]

/** Permiso del panel de reparto (lado repartidor). */
export const DELIVERY_USE_PERMISSION = 'delivery:use'
/** Permiso de gestión: asignar repartidor y verificar rendiciones. */
export const DELIVERY_MANAGE_PERMISSION = 'delivery:manage'

/** Acciones de auditoría/cronología del reparto. */
export const DELIVERY_AUDIT_ACTIONS = [
  'ORDER_ASSIGNED_TO_DELIVERY',
  'ORDER_DELIVERY_AUTHORIZED',
  'DELIVERY_COLLECTION_RECORDED',
  'DELIVERY_SETTLEMENT_CREATED',
  'DELIVERY_SETTLEMENT_VERIFIED',
  'DELIVERY_SETTLEMENT_REJECTED',
] as const

function has(user: Pick<AuthUser, 'permissions'>, permission: string) {
  return user.permissions.includes('*') || user.permissions.includes(permission)
}

export function canUseDelivery(user: Pick<AuthUser, 'permissions'>) {
  return has(user, DELIVERY_USE_PERMISSION)
}

export function canManageDelivery(user: Pick<AuthUser, 'permissions'>) {
  return has(user, DELIVERY_MANAGE_PERMISSION)
}

export function deliveryMethod(value: unknown): DeliveryMethod {
  const method = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!(DELIVERY_METHODS as readonly string[]).includes(method)) throw new InputError('Medio de cobro inválido: elegí efectivo o transferencia.')
  return method as DeliveryMethod
}

const INT_MAX = 2147483647

function money(value: unknown, label: string) {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > INT_MAX) throw new InputError(`${label} inválido.`)
  return amount
}

export type DeliveryBalance = { paidPyg: number; pendingPyg: number }

/**
 * Saldo real del pedido mezclando lo confirmado con lo pre-cobrado en la calle
 * (todavía sin rendir). Es la única cuenta que decide si el repartidor puede
 * cobrar más: nunca se cobra por encima del total.
 */
export function deliveryBalance(totalPyg: unknown, confirmedPyg: unknown, collectedPyg: unknown): DeliveryBalance {
  const total = money(totalPyg, 'Total del pedido')
  const confirmed = money(confirmedPyg, 'Monto confirmado')
  const collected = money(collectedPyg, 'Monto pre-cobrado')
  const paidPyg = confirmed + collected
  if (!Number.isSafeInteger(paidPyg)) throw new InputError('El monto supera el rango válido.')
  return { paidPyg, pendingPyg: Math.max(0, total - paidPyg) }
}

export type DeliveryPaymentRow = { amountPyg: number; status: string; deliveryUserId?: string | null }

/**
 * Resumen del pedido para el reparto: separa lo confirmado de lo pre-cobrado
 * en la calle (todavía sin verificar). Es lo que muestra el panel y lo que
 * decide si todavía falta cobrar.
 */
export function deliverySummary(order: { totalPyg: number; payments: DeliveryPaymentRow[] }) {
  const confirmedPyg = order.payments.filter(pago => pago.status === 'CONFIRMED').reduce((suma, pago) => suma + pago.amountPyg, 0)
  const collectedPyg = order.payments.filter(pago => pago.status === 'PENDING' && pago.deliveryUserId).reduce((suma, pago) => suma + pago.amountPyg, 0)
  const { paidPyg, pendingPyg } = deliveryBalance(order.totalPyg, confirmedPyg, collectedPyg)
  return { confirmedPyg, collectedPyg, paidPyg, pendingPyg }
}

/** Valida que un pre-cobro no supere el saldo disponible del pedido. */
export function assertCollectionWithinBalance(totalPyg: unknown, confirmedPyg: unknown, collectedPyg: unknown, amountPyg: unknown) {
  const amount = money(amountPyg, 'Monto del cobro')
  if (amount <= 0) throw new InputError('El monto del cobro debe ser mayor a cero.')
  const { pendingPyg } = deliveryBalance(totalPyg, confirmedPyg, collectedPyg)
  if (amount > pendingPyg) throw new InputError(`El cobro supera el saldo del pedido (disponible Gs ${pendingPyg.toLocaleString('es-PY')}).`, 409)
  return amount
}

/**
 * Un pedido cobrado íntegramente en la calle (pre-cobros por el total) habilita
 * la entrega sin autorización: no queda saldo abierto. Con saldo pendiente se
 * mantienen las reglas vigentes (crédito del cliente o autorización de entrega).
 */
export function deliveryCoversTotal(totalPyg: unknown, confirmedPyg: unknown, collectedPyg: unknown) {
  return deliveryBalance(totalPyg, confirmedPyg, collectedPyg).pendingPyg === 0
}
