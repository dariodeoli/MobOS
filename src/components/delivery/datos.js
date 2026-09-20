import { internationalPhone } from '@/utils/telefono'

// Proyección del pedido de reparto: el mismo shape para el panel del
// repartidor y para la vista de la tienda. Separa lo confirmado de lo
// pre-cobrado en la calle (todavía sin rendir) para que el saldo sea claro.

// Referencia estable para el modo demo: `useSellerData` reejecuta su consulta
// cuando cambia la identidad de estos argumentos.
export const SIN_DATOS = () => []

export const ENTREGA_LABELS = {
  PROCESSING: 'A entregar',
  IN_TRANSIT: 'En camino',
  READY_TO_SHIP: 'Listo p/ enviar',
  READY_FOR_PICKUP: 'Listo p/ retirar',
  DELIVERED: 'Entregado',
}

export const MEDIO_LABELS = { CASH: 'Efectivo', TRANSFER: 'Transferencia' }

export const RENDICION_LABELS = { PENDING: 'Pendiente', VERIFIED: 'Verificada', REJECTED: 'Rechazada' }

export function entregable(fulfillment) {
  return fulfillment !== 'DELIVERED'
}

export function deliveryFields(row) {
  const resumen = row.delivery || {}
  const cliente = row.customer || {}
  const direccion = (cliente.addresses || [])[0] || null
  const cobros = (row.payments || []).filter(pago => pago.status === 'PENDING' && pago.deliveryUserId)
  return {
    id: row.id,
    number: row.orderNumber || row.id,
    date: row.createdAt,
    cliente: cliente.name || 'Sin cliente',
    telefono: internationalPhone(cliente.phone, cliente.countryCode),
    telefonoVisible: cliente.phone || '',
    direccion: direccion ? [direccion.address, direccion.city, direccion.department].filter(Boolean).join(', ') : '',
    direccionEtiqueta: direccion?.label || '',
    direccionNotas: direccion?.notes || '',
    articulos: (row.items || []).map(item => `${item.quantity}× ${item.description}`),
    total: Number(row.totalPyg || 0),
    confirmado: Number(resumen.confirmedPyg || 0),
    cobrado: Number(resumen.collectedPyg || 0),
    pagado: Number(resumen.paidPyg || 0),
    pendiente: Number(resumen.pendingPyg ?? row.totalPyg ?? 0),
    fulfillment: row.fulfillmentStatus || 'PROCESSING',
    deliveryType: row.deliveryType || '',
    deliveryNotes: row.deliveryNotes || '',
    notas: row.notes || '',
    repartidor: row.assignedTo?.name || null,
    repartidorId: row.assignedToId || row.assignedTo?.id || null,
    cobros: cobros.map(pago => ({ id: pago.id, monto: Number(pago.amountPyg || 0), metodo: pago.method, referencia: pago.reference || '', cobradoEn: pago.collectedAt || pago.createdAt })),
    sinRendir: cobros.reduce((suma, pago) => suma + Number(pago.amountPyg || 0), 0),
    pagos: Array.isArray(row.payments) ? row.payments : [],
  }
}

export function settlementFields(row) {
  return {
    id: row.id,
    fecha: row.createdAt,
    repartidor: row.deliveryUser?.name || 'Repartidor',
    repartidorId: row.deliveryUserId,
    sucursal: row.branch?.name || '',
    total: Number(row.totalPyg || 0),
    pendiente: Number(row.pendingPyg || 0),
    pedidos: Number(row.ordersCount || 0),
    estado: row.status || 'PENDING',
    nota: row.note || '',
    verificadaPor: row.verifiedBy?.name || null,
    verificadaEn: row.verifiedAt || null,
    notaVerificacion: row.verificationNote || '',
    cobros: (row.payments || []).map(pago => ({
      id: pago.id,
      monto: Number(pago.amountPyg || 0),
      metodo: pago.method,
      referencia: pago.reference || '',
      estado: pago.status,
      collectedAt: pago.collectedAt || pago.createdAt,
      pedidoId: pago.order?.id,
      pedidoNumero: pago.order?.orderNumber,
      pedidoTotal: Number(pago.order?.totalPyg || 0),
      pedidoEstado: pago.order?.fulfillmentStatus,
      cliente: pago.order?.customer?.name || '',
    })),
  }
}
