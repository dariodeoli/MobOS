// Reglas de moneda por medio de pago (#142/#204), puras y compartidas por el
// cliente (validación del formulario y opciones del selector) y el backend.
//
// Pix cobra en reales, USDT/Cripto en dólares, y la transferencia bancaria no
// mezcla USDT: la cripto tiene su propio medio.

export const MONEDAS_FIJAS = { PIX: 'BRL', CRYPTO: 'USD' }

/** Monedas que el selector debe ocultar para el medio elegido. */
export function monedasExcluidas(kind) {
  return kind === 'TRANSFER' ? ['USDT'] : []
}

/** Mensaje de error de la moneda para el medio, o '' si la combinación es válida. */
export function errorDeMoneda(kind, currency) {
  if (kind === 'PIX' && currency !== 'BRL') return 'Pix cobra en reales (BRL).'
  if (kind === 'CRYPTO' && currency !== 'USD') return 'Cripto/USDT cobra en dólares (USD).'
  if (kind === 'TRANSFER' && currency === 'USDT') return 'USDT tiene su propio medio: usá USDT - Cripto.'
  return ''
}
