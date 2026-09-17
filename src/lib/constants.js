// Etiquetas canónicas de la interfaz. Evitan mapas duplicados (y divergentes)
// de medios de pago entre comprobantes, paneles y listados.
export const PAYMENT_METHOD_LABELS = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta / POS',
  PIX: 'Pix',
  CREDIT: 'Crédito',
  TRADE_IN: 'Canje',
}

export const paymentMethodLabel = (value) => PAYMENT_METHOD_LABELS[value] || value || ''

export const FULFILLMENT_LABELS = {
  PROCESSING: 'Preparando',
  IN_TRANSIT: 'En camino',
  READY_FOR_PICKUP: 'Listo para retirar',
  DELIVERED: 'Entregado',
}
