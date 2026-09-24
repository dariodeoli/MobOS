// Etiquetas de los medios de pago para las superficies del cliente (portal de
// la cuenta y pedido público): una sola fuente para que digan lo mismo que la
// app.
export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta / POS',
  CREDIT: 'Crédito',
  TRADE_IN: 'Canje',
  PIX: 'Pix',
  STORE_CREDIT: 'Saldo a favor',
  CRYPTO: 'USDT - Cripto',
}

export const etiquetaPago = (metodo: unknown): string => PAYMENT_LABELS[String(metodo)] || String(metodo || '')
