// Flujo de entrega del pedido, separado del pago. El tipo de entrega define
// qué estados aplican (retiro no se envía, reparto no se retira) y el grafo de
// transiciones es el mismo que valida el backend: acá se usa para ofrecer solo
// los próximos estados válidos en el selector.
import { FULFILLMENT_LABELS } from '@/lib/constants'

export const esRetiro = (deliveryType) => /retiro/i.test(String(deliveryType || ''))

export const ESTADOS_RETIRO = ['PENDING', 'PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP', 'PARTIAL', 'DELIVERED']
export const ESTADOS_DELIVERY = ['PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'PARTIAL', 'DELIVERED', 'NOT_DELIVERED']

const SIGUIENTES = {
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

export const etiquetaEntrega = (estado) => FULFILLMENT_LABELS[estado] || estado || 'Pendiente'

// Opciones del selector: el estado actual + los próximos válidos para el tipo.
export function opcionesDeEntrega(deliveryType, current) {
  const permitidos = esRetiro(deliveryType) ? ESTADOS_RETIRO : ESTADOS_DELIVERY
  const siguientes = (SIGUIENTES[current] || []).filter((estado) => permitidos.includes(estado))
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
