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
