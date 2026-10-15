// Medios de pago de los cobros: una sola traducción de «lo que dice el pago»
// (código del API o nombre legacy de la demo) al código canónico (CASH, TRANSFER…)
// y una sola agrupación por medio. La usan Caja (cierre), Inicio («Cómo te
// pagaron»), la conciliación y la auditoría, para que los totales por medio
// coincidan en todas las pantallas (#461).
import { ETIQUETAS_MEDIO_PAGO } from '../lib/constants.js'
import { cuentaComoCobro, montoDePago } from './pedido.js'

// Medio legacy de las ventas demo → código del medio. Las claves van en mayúsculas.
const METODOS_DE_MEDIO = {
  DINERO: 'CASH',
  'DINERO USD': 'CASH',
  EFECTIVO: 'CASH',
  'UENO BANK': 'TRANSFER',
  TRANSFERENCIA: 'TRANSFER',
  'POS UENO': 'CARD',
  TARJETA: 'CARD',
  PIX: 'PIX',
  'PIK ITAÚ': 'PIX',
  'USDT - CRIPTO': 'CRYPTO',
  USDT: 'CRYPTO',
  CANJE: 'TRADE_IN',
  'SALDO A FAVOR': 'STORE_CREDIT',
  'GIFT CARD': 'GIFT_CARD',
  DINELCO: 'CARD',
  CONTINENTAL: 'TRANSFER',
  FAMILIAR: 'TRANSFER',
  QR: 'QR',
  CRÉDITO: 'CREDIT',
}

/** Código del medio (CASH, TRANSFER…) a partir del nombre legacy de la demo. */
export function metodoDeMedio(medioLegacy) {
  return METODOS_DE_MEDIO[String(medioLegacy || '').toUpperCase()] || 'CASH'
}

/** Código del medio de un pago: el `method` del API o, si no, el nombre legacy. */
export function metodoDePago(pago) {
  const code = String(pago?.method || '').toUpperCase()
  if (ETIQUETAS_MEDIO_PAGO[code] || code === 'QR') return code
  return metodoDeMedio(pago?.medioPago)
}

export const etiquetaMedioPago = (code) => ETIQUETAS_MEDIO_PAGO[code] || (code === 'QR' ? 'QR' : code || 'Otro')

/**
 * Cobros agrupados por medio: `{ method, label, montoPyg, count }` ordenados por
 * monto. Suma firmada de los pagos confirmados (las reversiones restan); un par
 * pago-original + reversión no cuenta como cobro individual.
 */
export function cobrosPorMedio(pagos = []) {
  const lista = (Array.isArray(pagos) ? pagos : []).filter(cuentaComoCobro)
  const revertidos = new Set(lista.map((pago) => pago?.reversalOfId).filter(Boolean))
  const porMedio = new Map()
  for (const pago of lista) {
    const method = metodoDePago(pago)
    const fila = porMedio.get(method) || { method, label: etiquetaMedioPago(method), montoPyg: 0, count: 0 }
    fila.montoPyg += montoDePago(pago)
    if (!pago?.reversalOfId && !(pago?.id && revertidos.has(pago.id))) fila.count += 1
    porMedio.set(method, fila)
  }
  return [...porMedio.values()]
    .filter((fila) => fila.montoPyg !== 0 || fila.count > 0)
    .sort((a, b) => b.montoPyg - a.montoPyg)
}
