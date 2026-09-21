// Flujo de entrega del pedido, separado del pago. El método de entrega define
// qué estados aplican (delivery no retira, retiro no envía, el traslado entre
// sucursales tiene su propio lenguaje) y el grafo es el mismo que valida el
// backend: acá se usa para ofrecer solo los próximos estados válidos.
import { FULFILLMENT_LABELS } from '@/lib/constants'

export const metodoEntrega = (deliveryType) => {
  const tipo = String(deliveryType || '').toLowerCase()
  if (tipo.includes('entre sucursales')) return 'TRASLADO'
  if (tipo.includes('otra sucursal')) return 'RETIRO_SUCURSAL'
  if (tipo.includes('retiro')) return 'RETIRO'
  return 'DELIVERY'
}

export const esRetiro = (deliveryType) => metodoEntrega(deliveryType) !== 'DELIVERY'

// Compatibilidad con los nombres históricos (retiro / delivery).
export const ESTADOS_RETIRO = ['PENDING', 'PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'PICKED_UP', 'PARTIAL']
export const ESTADOS_DELIVERY = ['PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'PARTIAL', 'NOT_DELIVERED']

const ESTADOS = {
  DELIVERY: ESTADOS_DELIVERY,
  RETIRO: ['PENDING', 'PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP', 'PARTIAL'],
  RETIRO_SUCURSAL: ESTADOS_RETIRO,
  TRASLADO: ESTADOS_RETIRO,
}

const SIGUIENTES = {
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

export const etiquetaEntrega = (estado) => FULFILLMENT_LABELS[estado] || estado || 'Pendiente'

// Opciones del selector: el estado actual + los próximos válidos del método. Si
// el pedido quedó en un estado de otro flujo (dato viejo), se ofrecen los del
// método para converger.
export function opcionesDeEntrega(deliveryType, current) {
  const metodo = metodoEntrega(deliveryType)
  const permitidos = ESTADOS[metodo]
  if (!permitidos.includes(current)) return permitidos.filter((estado) => estado !== 'PENDING')
  const siguientes = (SIGUIENTES[metodo][current] || []).filter((estado) => permitidos.includes(estado))
  return [current, ...siguientes].filter(Boolean)
}

// ¿Es un estado final? (para atenuar/cerrar acciones)
export const entregaFinalizada = (estado) => ['DELIVERED', 'PICKED_UP'].includes(estado)

// Tono del badge por estado (verde cerrado, azul en tránsito, ámbar en curso,
// rojo problema).
export const tonoEntrega = (estado) => {
  if (['DELIVERED', 'PICKED_UP'].includes(estado)) return 'green'
  if (['SHIPPED', 'IN_TRANSIT', 'READY_TO_SHIP'].includes(estado)) return 'blue'
  if (['READY_FOR_PICKUP', 'PARTIAL'].includes(estado)) return 'orange'
  if (estado === 'NOT_DELIVERED') return 'red'
  return 'slate'
}
