import type { AuthUser } from './auth'
import { InputError, textInput } from './payment-input'

export { returnRequest } from './returns'

export const FULFILLMENT_STATES = ['PROCESSING', 'IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'DELIVERED'] as const
export type FulfillmentState = typeof FULFILLMENT_STATES[number]

const nextStates: Record<FulfillmentState, readonly FulfillmentState[]> = {
  PROCESSING: ['IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'DELIVERED'],
  IN_TRANSIT: ['READY_TO_SHIP', 'DELIVERED'],
  READY_TO_SHIP: ['IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED'],
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
  // El repartidor no entra por el panel de venta: su acceso vive en
  // /api/delivery (solo sus pedidos asignados y sin tocar cobros ni datos de
  // venta). `false` acá cierra el resto de las rutas de pedido de una sola vez.
  if (user.role === 'REPARTIDOR') return false
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

// Comprobante congelado al emitir: guarda una copia de lo que el comprobante
// muestra (pedido, ítems, pagos, cliente, vendedor, sucursal y empresa) para
// que la historia no cambie si después se edita cualquiera de esos datos.
export function armarComprobante(datos: unknown) {
  // Copia profunda: el comprobante no comparte referencias con los datos vivos.
  // El resultado es JSON plano (lo que JSONB acepta).
  return { version: 1, emitidoEn: new Date().toISOString(), datos: JSON.parse(JSON.stringify(datos)) }
}
