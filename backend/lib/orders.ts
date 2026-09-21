import type { AuthUser } from './auth'
import { InputError, textInput } from './payment-input'

// Estados de entrega del pedido (separados del pago). Los de retiro y los de
// reparto se distinguen por el tipo de entrega: la transición válida depende
// del pedido, no del capricho de la UI.
export const FULFILLMENT_STATES = [
  'PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT',
  'READY_FOR_PICKUP', 'PICKED_UP', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED',
] as const
export type FulfillmentState = typeof FULFILLMENT_STATES[number]

// Siguientes estados posibles desde cada uno (el grafo no cambia por tipo: el
// tipo acota qué estados puede *usar* el pedido, no a dónde puede ir).
const nextStates: Record<FulfillmentState, readonly FulfillmentState[]> = {
  PENDING: ['PROCESSING', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  PROCESSING: ['READY_TO_SHIP', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  READY_TO_SHIP: ['SHIPPED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  SHIPPED: ['IN_TRANSIT', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  IN_TRANSIT: ['PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED'],
  PICKED_UP: [],
  PARTIAL: ['DELIVERED', 'PICKED_UP', 'IN_TRANSIT', 'NOT_DELIVERED'],
  DELIVERED: [],
  NOT_DELIVERED: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'READY_FOR_PICKUP', 'IN_TRANSIT'],
}

// Estados exclusivos de cada tipo: retirar es solo del retiro y enviar/no
// entregar solo del reparto. Los estados históricos (procesando, listo, en
// camino, entregado…) siguen valiendo para ambos: hay pedidos que cambiaron de
// tipo a mitad de camino y la UI ahora ofrece solo los que corresponden.
const SOLO_RETIRO: readonly FulfillmentState[] = ['PICKED_UP']
const SOLO_DELIVERY: readonly FulfillmentState[] = ['SHIPPED', 'NOT_DELIVERED']

export const tipoDeEntrega = (deliveryType?: string | null): 'RETIRO' | 'DELIVERY' =>
  String(deliveryType || '').toLowerCase().includes('retiro') ? 'RETIRO' : 'DELIVERY'


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

export function validateFulfillmentTransition(current: string, requested: unknown, options: { deliveryType?: string | null } = {}) {
  const next = textInput(requested, 'Estado de entrega', 50) as FulfillmentState
  if (!FULFILLMENT_STATES.includes(next)) throw new InputError('Estado de entrega inválido.')
  if (current === next) throw new InputError('El pedido ya tiene ese estado de entrega.')
  // Con tipo de entrega conocido se acotan los estados exclusivos del otro tipo.
  if (options.deliveryType !== undefined) {
    const tipo = tipoDeEntrega(options.deliveryType)
    if (tipo === 'RETIRO' && SOLO_DELIVERY.includes(next)) throw new InputError('Ese estado es de una entrega por reparto, no de un retiro.', 409)
    if (tipo === 'DELIVERY' && SOLO_RETIRO.includes(next)) throw new InputError('Ese estado es de un retiro en tienda, no de un reparto.', 409)
  }
  if (!FULFILLMENT_STATES.includes(current as FulfillmentState) || !nextStates[current as FulfillmentState].includes(next)) {
    throw new InputError('La transición de entrega no está permitida.', 409)
  }
  return next
}

export function returnRequest(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !['operation', 'reason', 'refundPyg', 'replacementOrderId', 'replacementOrderNumber', 'refundMode', 'restock'].includes(key))) throw new InputError('La devolución contiene campos no admitidos.')
  const operation = textInput(input.operation, 'Operación', 20).toUpperCase()
  if (!['RETURN', 'EXCHANGE', 'CANCEL'].includes(operation)) throw new InputError('Operación de postventa inválida.')
  const reason = textInput(input.reason, 'Motivo', 1000)
  if (reason.length < 3) throw new InputError('Indicá un motivo de al menos 3 caracteres.')
  const refundPyg = input.refundPyg === undefined ? undefined : Number(input.refundPyg)
  if (refundPyg !== undefined && (!Number.isSafeInteger(refundPyg) || refundPyg < 0)) throw new InputError('Monto de devolución inválido.')
  const replacementOrderId = input.replacementOrderId === undefined ? undefined : textInput(input.replacementOrderId, 'Pedido de cambio', 200)
  const replacementOrderNumber = input.replacementOrderNumber === undefined ? undefined : textInput(input.replacementOrderNumber, 'Número de pedido de cambio', 200)
  if (operation === 'EXCHANGE' && !replacementOrderId && !replacementOrderNumber) throw new InputError('Indicá el pedido que reemplaza esta venta.')
  // Cómo se devuelve el dinero: en efectivo/cuenta (comportamiento histórico) o
  // como saldo a favor del cliente (nota de crédito interna reutilizable).
  const refundMode = input.refundMode === undefined || input.refundMode === null || input.refundMode === '' ? 'CASH' : textInput(input.refundMode, 'Modo de reembolso', 10).toUpperCase()
  if (!['CASH', 'CREDIT'].includes(refundMode)) throw new InputError('Modo de reembolso inválido.')
  // Qué hacer con el stock devuelto: nada (revisión aparte), volver a la venta
  // o dejarlo marcado como defectuoso para revisión.
  const restock = input.restock === undefined || input.restock === null || input.restock === '' ? 'NONE' : textInput(input.restock, 'Reposición', 10).toUpperCase()
  if (!['NONE', 'AVAILABLE', 'REVIEW'].includes(restock)) throw new InputError('Reposición de stock inválida.')
  if (operation === 'EXCHANGE' && refundMode === 'CREDIT') throw new InputError('Un cambio no genera saldo a favor.')
  return { operation, reason, refundPyg, replacementOrderId, replacementOrderNumber, refundMode, restock }
}

// Comprobante congelado al emitir: guarda una copia de lo que el comprobante
// muestra (pedido, ítems, pagos, cliente, vendedor, sucursal y empresa) para
// que la historia no cambie si después se edita cualquiera de esos datos.
export function armarComprobante(datos: unknown) {
  // Copia profunda: el comprobante no comparte referencias con los datos vivos.
  // El resultado es JSON plano (lo que JSONB acepta).
  return { version: 1, emitidoEn: new Date().toISOString(), datos: JSON.parse(JSON.stringify(datos)) }
}
