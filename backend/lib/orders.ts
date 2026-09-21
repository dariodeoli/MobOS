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

// El grafo de transiciones vive por método (arriba): un pedido de retiro nunca
// puede pasar por "listo para enviar" y uno de reparto nunca por "retirar".

// Métodos de entrega (#191). Cada método tiene su propia máquina de estados y
// su propio lenguaje: "listo para enviar" es de reparto, "listo para retirar"
// es de retiro y "en camino a la sucursal" es de traslado interno.
export type MetodoEntrega = 'DELIVERY' | 'RETIRO' | 'RETIRO_SUCURSAL' | 'TRASLADO'

export const METODO_ENTREGA_LABELS: Record<MetodoEntrega, string> = {
  DELIVERY: 'Delivery',
  RETIRO: 'Retiro en tienda',
  RETIRO_SUCURSAL: 'Retiro en otra sucursal',
  TRASLADO: 'Envío entre sucursales',
}

export const SEGUIMIENTO_ENCABEZADO: Record<MetodoEntrega, string> = {
  DELIVERY: 'Seguimiento de envío',
  RETIRO: 'Seguimiento de retiro',
  RETIRO_SUCURSAL: 'Seguimiento de retiro',
  TRASLADO: 'Seguimiento de traslado',
}

export function metodoDeEntrega(deliveryType?: string | null): MetodoEntrega {
  const tipo = String(deliveryType || '').toLowerCase()
  if (tipo.includes('entre sucursales')) return 'TRASLADO'
  if (tipo.includes('otra sucursal')) return 'RETIRO_SUCURSAL'
  if (tipo.includes('retiro')) return 'RETIRO'
  return 'DELIVERY'
}

// Flujo principal de cada método, en orden. `PENDING` (solicitado / confirmado)
// es la entrada histórica y se trata como el primer paso al pintar el avance.
const FLUJOS: Record<MetodoEntrega, readonly FulfillmentState[]> = {
  DELIVERY: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  RETIRO: ['PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP'],
  RETIRO_SUCURSAL: ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'PICKED_UP'],
  TRASLADO: ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'PICKED_UP'],
}

// Estados que cada método puede usar (los laterales al final: parcial / no
// entregado). Un estado que no está acá jamás se muestra ni se acepta para ese
// método.
export const ESTADOS_POR_METODO: Record<MetodoEntrega, readonly FulfillmentState[]> = {
  DELIVERY: [...FLUJOS.DELIVERY, 'PARTIAL', 'NOT_DELIVERED'],
  RETIRO: [...FLUJOS.RETIRO, 'PARTIAL'],
  RETIRO_SUCURSAL: [...FLUJOS.RETIRO_SUCURSAL, 'PARTIAL'],
  TRASLADO: [...FLUJOS.TRASLADO, 'PARTIAL'],
}

export const ETIQUETA_ESTADO_LATERAL: Record<string, string> = {
  PARTIAL: 'Entrega parcial',
  NOT_DELIVERED: 'No se pudo entregar',
}

const ETIQUETAS_FLUJO: Record<MetodoEntrega, Record<string, string>> = {
  DELIVERY: {
    PROCESSING: 'En preparación',
    READY_TO_SHIP: 'Listo para enviar',
    SHIPPED: 'Enviado',
    IN_TRANSIT: 'En camino al cliente',
    DELIVERED: 'Entregado',
  },
  RETIRO: {
    PROCESSING: 'En preparación',
    READY_FOR_PICKUP: 'Listo para retirar',
    PICKED_UP: 'Retirado',
  },
  RETIRO_SUCURSAL: {
    PROCESSING: 'En preparación',
    IN_TRANSIT: 'En camino a la sucursal de retiro',
    READY_FOR_PICKUP: 'Listo para retirar',
    PICKED_UP: 'Retirado',
  },
  TRASLADO: {
    PROCESSING: 'En preparación en sucursal origen',
    IN_TRANSIT: 'En camino a la sucursal destino',
    READY_FOR_PICKUP: 'Recibido en destino · listo para retirar',
    PICKED_UP: 'Retirado',
  },
}

// Transiciones válidas dentro de cada flujo. Los laterales se muestran como
// estado actual, no como paso de la línea de progreso. La secuencia es flexible
// (el repartidor puede salir a la calle sin pasar por "listo para enviar"), pero
// los estados son exclusivos del método: nunca se cruzan.
const TRANSICIONES: Record<MetodoEntrega, Partial<Record<FulfillmentState, readonly FulfillmentState[]>>> = {
  DELIVERY: {
    PENDING: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'],
    PROCESSING: ['READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'],
    READY_TO_SHIP: ['SHIPPED', 'IN_TRANSIT'],
    SHIPPED: ['IN_TRANSIT', 'DELIVERED'],
    IN_TRANSIT: ['DELIVERED', 'PARTIAL', 'NOT_DELIVERED'],
    NOT_DELIVERED: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'],
    PARTIAL: ['DELIVERED', 'NOT_DELIVERED'],
    DELIVERED: [],
  },
  RETIRO: {
    PENDING: ['PROCESSING', 'READY_FOR_PICKUP'],
    PROCESSING: ['READY_FOR_PICKUP'],
    READY_FOR_PICKUP: ['PICKED_UP', 'PARTIAL'],
    PARTIAL: ['PICKED_UP'],
    PICKED_UP: [],
  },
  RETIRO_SUCURSAL: {
    PENDING: ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP'],
    PROCESSING: ['IN_TRANSIT', 'READY_FOR_PICKUP'],
    IN_TRANSIT: ['READY_FOR_PICKUP', 'PICKED_UP'],
    READY_FOR_PICKUP: ['PICKED_UP', 'PARTIAL'],
    PARTIAL: ['PICKED_UP'],
    PICKED_UP: [],
  },
  TRASLADO: {
    PENDING: ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP'],
    PROCESSING: ['IN_TRANSIT', 'READY_FOR_PICKUP'],
    IN_TRANSIT: ['READY_FOR_PICKUP', 'PICKED_UP'],
    READY_FOR_PICKUP: ['PICKED_UP', 'PARTIAL'],
    PARTIAL: ['PICKED_UP'],
    PICKED_UP: [],
  },
}

// Un pedido viejo puede estar en un estado de otro flujo (p. ej. un retiro que
// quedó "listo para enviar"): desde ahí solo se converge al flujo del método,
// nunca a los primeros pasos.
function convergencia(metodo: MetodoEntrega): readonly FulfillmentState[] {
  return ESTADOS_POR_METODO[metodo].filter(estado => estado !== 'PENDING' && estado !== 'PROCESSING')
}

/** Estado de seguimiento con la línea de progreso del método. */
export function seguimientoDeEntrega(deliveryType: string | null | undefined, estadoActual: string, fechas: Record<string, string> = {}) {
  const metodo = metodoDeEntrega(deliveryType)
  const flujo = FLUJOS[metodo]
  const actual = estadoActual === 'PENDING' ? 'PROCESSING' : estadoActual
  const indice = flujo.indexOf(actual as FulfillmentState)
  const lateral = Object.hasOwn(ETIQUETA_ESTADO_LATERAL, estadoActual)
  return {
    metodo,
    metodoLabel: METODO_ENTREGA_LABELS[metodo],
    encabezado: SEGUIMIENTO_ENCABEZADO[metodo],
    estado: estadoActual,
    estadoLabel: lateral ? ETIQUETA_ESTADO_LATERAL[estadoActual] : ETIQUETAS_FLUJO[metodo][actual] || actual,
    pasos: flujo.map((paso, posicion) => ({
      key: paso,
      label: ETIQUETAS_FLUJO[metodo][paso],
      hecho: Boolean(fechas[paso]) || (indice >= 0 && posicion <= indice) || (lateral && posicion < flujo.length - 1),
      actual: paso === actual,
      at: fechas[paso] || null,
    })),
  }
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

export function validateFulfillmentTransition(current: string, requested: unknown, options: { deliveryType?: string | null } = {}) {
  const next = textInput(requested, 'Estado de entrega', 50) as FulfillmentState
  if (!FULFILLMENT_STATES.includes(next)) throw new InputError('Estado de entrega inválido.')
  if (current === next) throw new InputError('El pedido ya tiene ese estado de entrega.')
  // El método (delivery / retiro / retiro en otra sucursal / traslado) define
  // qué estados existen: jamás estados incompatibles. Dentro del método se
  // acepta avanzar (incluso saltando pasos: el reparto real hace preparando →
  // entregado) y reparar datos; el orden fino lo ofrece la UI.
  const metodo = metodoDeEntrega(options.deliveryType)
  const propios = ESTADOS_POR_METODO[metodo]
  if (!propios.includes(next)) {
    throw new InputError(`Ese estado no aplica a ${METODO_ENTREGA_LABELS[metodo]} (${SEGUIMIENTO_ENCABEZADO[metodo].toLowerCase()}).`, 409)
  }
  const finales: readonly FulfillmentState[] = ['DELIVERED', 'PICKED_UP']
  if (finales.includes(current as FulfillmentState)) {
    throw new InputError('El pedido ya está entregado.', 409)
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
