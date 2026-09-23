// Etiquetas canónicas de la interfaz. Evitan mapas duplicados (y divergentes)
// de medios de pago entre comprobantes, paneles y listados.
import { ESTADO_ENTREGA_BADGE } from './estadosPedido.js'

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

// Etiquetas de entrega: salen del mapa con badge compartido (lote 18) para que
// el listado, el POS, el comprobante y los impresos digan lo mismo; `CANCELLED`
// es el único estado que no tiene badge propio.
export const FULFILLMENT_LABELS = {
  ...Object.fromEntries(Object.entries(ESTADO_ENTREGA_BADGE).map(([clave, { label }]) => [clave, label])),
  CANCELLED: 'Cancelado',
}

// Alias compatible con los imports previos (ETIQUETAS_MEDIO_PAGO).
export const ETIQUETAS_MEDIO_PAGO = PAYMENT_METHOD_LABELS
