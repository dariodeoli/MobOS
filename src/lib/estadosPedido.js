// Estados de pedido, entrega y garantía con su etiqueta visible y su tono
// (docs/PLANTILLA-OBJETOS.md §3). Los comparten las páginas públicas del
// cliente (seguimiento, portal y garantía): etiqueta y tono salen de acá y no
// se copian por página. Los mapas internos con badge (label + color) de las
// pantallas de gestión siguen su propio objeto.

export const ESTADO_PEDIDO = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }

export const ESTADO_ENTREGA = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }

export const ESTADO_GARANTIA = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }

export const tonoPedido = (estado) => (estado === 'COMPLETED' ? 'ok' : estado === 'CANCELLED' ? 'bad' : 'warn')

export const tonoGarantia = (estado) => (estado === 'DELIVERED' ? 'neutro' : estado === 'READY' ? 'ok' : 'info')

// Mapas con badge (`label` + `color`) de las pantallas de gestión: la misma
// etiqueta y el mismo color en la ficha del cliente, el servicio técnico y los
// listados. No se re-etiqueta un estado por pantalla.
export const ESTADO_PEDIDO_BADGE = {
  PENDING: { label: 'Pendiente', color: 'orange' },
  REGISTERED: { label: 'Registrado', color: 'blue' },
  COMPLETED: { label: 'Completado', color: 'green' },
  CANCELLED: { label: 'Cancelado', color: 'red' },
}

export const ESTADO_ENTREGA_BADGE = {
  PROCESSING: { label: 'Preparando', color: 'blue' },
  PENDING: { label: 'Pendiente', color: 'slate' },
  SHIPPED: { label: 'Enviado', color: 'blue' },
  IN_TRANSIT: { label: 'En camino', color: 'orange' },
  PICKED_UP: { label: 'Retirado', color: 'green' },
  PARTIAL: { label: 'Entrega parcial', color: 'orange' },
  NOT_DELIVERED: { label: 'No entregado', color: 'red' },
  READY_TO_SHIP: { label: 'Listo p/ enviar', color: 'blue' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', color: 'green' },
  DELIVERED: { label: 'Entregado', color: 'slate' },
}

// Avance del ciclo de una garantía (tablero por etapas, #215/#241): la etapa
// siguiente de cada estado; la entregada no avanza.
const CLAVES_GARANTIA = Object.keys(ESTADO_GARANTIA)
export const SIGUIENTE_GARANTIA = Object.fromEntries(CLAVES_GARANTIA.slice(0, -1).map((clave, indice) => [clave, CLAVES_GARANTIA[indice + 1]]))

export const ESTADO_GARANTIA_BADGE = {
  RECEIVED: { label: 'Recibida', color: 'orange' },
  DIAGNOSIS: { label: 'En diagnóstico', color: 'blue' },
  READY: { label: 'Lista', color: 'green' },
  DELIVERED: { label: 'Entregada', color: 'slate' },
}
