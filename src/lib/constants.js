// Etiquetas canónicas de la interfaz. Evitan mapas duplicados (y divergentes)
// de medios de pago entre comprobantes, paneles y listados.
export const PAYMENT_METHOD_LABELS = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta / POS',
  PIX: 'Pix',
  CRYPTO: 'USDT - Cripto',
  CREDIT: 'Crédito',
  TRADE_IN: 'Canje',
  STORE_CREDIT: 'Saldo a favor',
}

export const paymentMethodLabel = (value) => PAYMENT_METHOD_LABELS[value] || value || ''

export const FULFILLMENT_LABELS = {
  PENDING: 'Pendiente',
  PROCESSING: 'Preparando',
  READY_TO_SHIP: 'Listo p/ enviar',
  SHIPPED: 'Enviado',
  IN_TRANSIT: 'En camino',
  READY_FOR_PICKUP: 'Listo para retirar',
  PICKED_UP: 'Retirado',
  PARTIAL: 'Entrega parcial',
  DELIVERED: 'Entregado',
  NOT_DELIVERED: 'No entregado',
  CANCELLED: 'Cancelado',
}

// Alias compatible con los imports previos (ETIQUETAS_MEDIO_PAGO).
export const ETIQUETAS_MEDIO_PAGO = PAYMENT_METHOD_LABELS
