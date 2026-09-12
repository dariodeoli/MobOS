import type { AuthUser } from './auth'
import { InputError, textInput } from './payment-input'

export const FULFILLMENT_STATES = ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED'] as const
export type FulfillmentState = typeof FULFILLMENT_STATES[number]

const nextStates: Record<FulfillmentState, readonly FulfillmentState[]> = {
  PROCESSING: ['IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  READY_FOR_PICKUP: ['DELIVERED'],
  DELIVERED: [],
}

function has(user: AuthUser, permission: string) {
  return user.permissions.includes('*') || user.permissions.includes(permission)
}

// Descuentos y devoluciones nunca se aprueban desde datos enviados por el
// navegador: la sesión determina quién autorizó y queda registrada en auditoría.
export function canApproveOrderDiscount(user: AuthUser) {
  return user.role === 'ADMIN' || user.role === 'GERENTE' || has(user, 'orders:manage')
}

export function canProcessOrderReturn(user: AuthUser) {
  return user.role === 'ADMIN' || user.role === 'GERENTE' || has(user, 'orders:manage')
}

export function canAccessOrder(user: { id: string; role: string; branchId: string | null }, order: { sellerId: string; branchId: string | null }) {
  if (user.role === 'VENDEDOR' && order.sellerId !== user.id) return false
  if ((user.branchId === null && order.branchId !== null) || (user.branchId && order.branchId !== null && order.branchId !== user.branchId)) return false
  return true
}

export function validateFulfillmentTransition(current: string, requested: unknown) {
  const next = textInput(requested, 'Estado de entrega', 50) as FulfillmentState
  if (!FULFILLMENT_STATES.includes(next)) throw new InputError('Estado de entrega inválido.')
  if (current === next) throw new InputError('El pedido ya tiene ese estado de entrega.')
  if (!FULFILLMENT_STATES.includes(current as FulfillmentState) || !nextStates[current as FulfillmentState].includes(next)) {
    throw new InputError('La transición de entrega no está permitida.', 409)
  }
  return next
}

export function returnRequest(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !['operation', 'reason', 'refundPyg', 'replacementOrderId'].includes(key))) throw new InputError('La devolución contiene campos no admitidos.')
  const operation = textInput(input.operation, 'Operación', 20).toUpperCase()
  if (operation !== 'RETURN' && operation !== 'EXCHANGE') throw new InputError('Operación de postventa inválida.')
  const reason = textInput(input.reason, 'Motivo', 1000)
  if (reason.length < 3) throw new InputError('Indicá un motivo de al menos 3 caracteres.')
  const refundPyg = input.refundPyg === undefined ? undefined : Number(input.refundPyg)
  if (refundPyg !== undefined && (!Number.isSafeInteger(refundPyg) || refundPyg < 0)) throw new InputError('Monto de devolución inválido.')
  const replacementOrderId = input.replacementOrderId === undefined ? undefined : textInput(input.replacementOrderId, 'Pedido de cambio', 200)
  if (operation === 'EXCHANGE' && !replacementOrderId) throw new InputError('Indicá el pedido que reemplaza esta venta.')
  return { operation, reason, refundPyg, replacementOrderId }
}
