// Cuentas de cobro: conversión de un pago a guaraníes y actualización de una
// fila al editarla. Sin JSX ni React para poder testear la regla de la
// cotización (la automática del servicio nunca pisa la escrita a mano, #173-A).

import { origenParaServidor } from './cotizacion.js'
import { convertirAPyg, montoMaximoEnMoneda } from './conversionPyg.js'

// Rango razonable de una cotización escrita a mano (Gs por unidad extranjera).
export const COTIZACION_MIN = 1000
export const COTIZACION_MAX = 20000
// Desvío (%) contra la cotización de hoy a partir del cual se avisa.
export const DESVIO_COTIZACION_PCT = 5

/** '' si la cotización escrita es razonable; si no, el motivo. */
export function errorCotizacion(valor) {
  const n = decimal(valor)
  if (!Number.isFinite(n)) return ''
  if (n < COTIZACION_MIN || n > COTIZACION_MAX) return `La cotización debe estar entre ${COTIZACION_MIN.toLocaleString('es-PY')} y ${COTIZACION_MAX.toLocaleString('es-PY')} Gs.`
  return ''
}

/** Aviso (no bloquea) si la cotización se aparta más de 5% de la de hoy. */
export function avisoDesvioCotizacion(valor, referencia) {
  const n = decimal(valor)
  const ref = Number(referencia)
  if (!Number.isFinite(n) || !(ref > 0)) return ''
  const pct = Math.abs(n - ref) / ref * 100
  return pct > DESVIO_COTIZACION_PCT ? `Se aparta ${pct.toFixed(1).replace('.', ',')}% de la cotización de hoy (${Math.round(ref).toLocaleString('es-PY')}).` : ''
}

export const FOREIGN = (currency) => currency === 'USD' || currency === 'BRL'

export const decimal = (value) => {
  const text = String(value ?? '').trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
}

export function accountPayment(payment, accounts) {
  const account = accounts.find((a) => a.id === payment.accountId && a.isActive)
  if (!account) throw new Error('Elegí una cuenta activa para cada pago.')
  if (!['USD', 'PYG', 'BRL'].includes(account.currency)) throw new Error('La cuenta debe estar en USD, PYG o BRL.')
  const originalAmount = account.currency === 'PYG'
    ? (/^\d+$/.test(String(payment.originalAmount)) ? Number(payment.originalAmount) : NaN)
    : decimal(payment.originalAmount)
  const exchangeRatePyg = FOREIGN(account.currency) ? decimal(payment.exchangeRatePyg) : 1
  if (!Number.isFinite(originalAmount) || originalAmount <= 0 ||
      (account.currency === 'PYG' ? !Number.isSafeInteger(originalAmount) : !/^\d+(\.\d{1,2})?$/.test(String(payment.originalAmount).trim().replace(',', '.')))) {
    throw new Error('Ingresá un monto positivo: USD/BRL admite hasta 2 decimales y PYG solo enteros.')
  }
  if (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0) throw new Error('Ingresá una cotización manual mayor a cero.')
  const rangoCotizacion = FOREIGN(account.currency) ? errorCotizacion(payment.exchangeRatePyg) : ''
  if (rangoCotizacion) throw new Error(rangoCotizacion)
  // Misma aritmética entera (HALF_UP) que el servidor: sin diferencias de 1 Gs.
  const amountPyg = convertirAPyg(String(payment.originalAmount).trim(), FOREIGN(account.currency) ? String(payment.exchangeRatePyg).trim() : '1')
  if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0) throw new Error('El monto convertido en PYG no es válido.')
  const tradeIn = account.kind === 'TRADE_IN' ? {
    serial: (payment.tradeIn?.serial || '').trim(),
    model: (payment.tradeIn?.model || '').trim(),
    conditionNotes: (payment.tradeIn?.conditionNotes || '').trim(),
  } : undefined
  if (tradeIn && (!tradeIn.serial || !tradeIn.model || !tradeIn.conditionNotes)) throw new Error('El canje requiere serial, modelo y condición del equipo recibido.')
  // #401: el origen (fuente o manual) viaja informativo; el valor que cuenta es exchangeRatePyg.
  const exchangeRateOrigin = FOREIGN(account.currency) ? origenParaServidor(payment.rateOrigin) : undefined
  return { accountId: account.id, originalAmount, exchangeRatePyg, amountPyg, method: account.kind, status: 'CONFIRMED', ...(tradeIn ? { tradeIn } : {}), ...(exchangeRateOrigin ? { exchangeRateOrigin } : {}) }
}

// El campo legacy monto siempre representa guaraníes, incluso al ingresar USD/BRL.
// `automatico` marca la cotización sugerida por el servicio (#173-A): nunca pisa
// una cotización que ya esté cargada, porque la consulta puede volver después de
// que el vendedor la escriba a mano.
export function updateAccountPayment(payment, change, accounts) {
  const { automatico, ...cambios } = change
  if (automatico && (Number(payment.exchangeRatePyg) > 0 || payment.rateOrigin?.manual)) return payment
  const next = { ...payment, ...cambios }
  const account = accounts.find((a) => a.id === next.accountId && a.isActive)
  const original = decimal(next.originalAmount)
  const rate = FOREIGN(account?.currency) ? decimal(next.exchangeRatePyg) : 1
  const amount = account && original > 0 && rate > 0 ? convertirAPyg(String(next.originalAmount).trim(), FOREIGN(account.currency) ? String(next.exchangeRatePyg).trim() : '1') : NaN
  return { ...next, medioPago: account?.name || '', cuenta: account?.name || '', monto: account && original > 0 && rate > 0 && Number.isSafeInteger(amount) ? String(amount) : '' }
}

// Cambio (o primera elección) de la cuenta de un pago. Devuelve el cambio a
// aplicar y si falta proponer el monto cuando llegue la cotización automática.
// Otra moneda → la cotización de la cuenta anterior se descarta (USD 7300 no es
// la de BRL); PYG no lleva cotización. Misma moneda con monto cargado → se
// conserva el monto.
export function cambiarCuentaPago(payment, accounts, accountId, pendientePyg = 0) {
  const actual = accounts.find((a) => a.id === payment.accountId)
  const elegida = accounts.find((a) => a.id === accountId)
  const esPyg = !elegida || elegida.currency === 'PYG'
  const cambioMoneda = Boolean(actual) && (elegida?.currency || 'PYG') !== actual.currency
  const exchangeRatePyg = esPyg || cambioMoneda ? '' : payment.exchangeRatePyg
  const rate = esPyg ? 1 : decimal(exchangeRatePyg)
  const conservar = Boolean(actual) && !cambioMoneda && String(payment.originalAmount || '') !== ''
  const originalAmount = conservar
    ? payment.originalAmount
    : pendientePyg > 0 && rate > 0
      ? (esPyg ? String(Math.round(pendientePyg)) : montoMaximoEnMoneda(pendientePyg, exchangeRatePyg))
      : ''
  return {
    cambio: { accountId, originalAmount, exchangeRatePyg, tradeIn: undefined, ...(exchangeRatePyg === '' ? { rateOrigin: undefined } : {}) },
    proponerAlLlegarCotizacion: cambioMoneda && !esPyg && originalAmount === '',
  }
}

// Saldo que queda tras un pago en moneda extranjera cuando es menor a un
// centavo de esa moneda en guaraníes: no se puede cobrar en USD, se cierra en Gs.
export function residuoSubCentavo(pendientePyg, ultimoPago, cuentas) {
  const cuenta = (cuentas || []).find((a) => a.id === ultimoPago?.accountId)
  const rate = decimal(ultimoPago?.exchangeRatePyg)
  const pendiente = Math.round(Number(pendientePyg) || 0)
  if (!cuenta || !FOREIGN(cuenta.currency) || !(rate > 0) || ultimoPago?.noPagado) return 0
  return pendiente > 0 && pendiente < rate / 100 ? pendiente : 0
}

// Cuenta de efectivo en guaraníes para cerrar un residuo o dar el vuelto.
export const cuentaEfectivoPyg = (cuentas) => (cuentas || []).find((a) => a.isActive && a.currency === 'PYG' && a.kind === 'CASH')

// Vuelto de pagos en efectivo en moneda extranjera: lo que los pagos suman de
// más sobre el total. Solo se acepta si ese excedente lo cubre efectivo
// extranjero (con transferencia o tarjeta un exceso sigue siendo un error).
export function vueltoEfectivoExtranjero(pagos, cuentas, totalGeneral) {
  const montoPyg = (p) => (p.noPagado ? 0 : Number(String(p.monto ?? '').replace(/\D/g, '')) || 0)
  const pagado = (pagos || []).reduce((s, p) => s + montoPyg(p), 0)
  const exceso = pagado - totalGeneral
  if (!(exceso > 0)) return { exceso: 0, vuelto: 0, permitido: true }
  const efectivoExtranjero = (pagos || []).reduce((s, p) => {
    const c = (cuentas || []).find((a) => a.id === p.accountId)
    return c && c.kind === 'CASH' && FOREIGN(c.currency) ? s + montoPyg(p) : s
  }, 0)
  return { exceso, vuelto: exceso, permitido: efectivoExtranjero >= exceso }
}

// Ajusta los pagos para el servidor cuando hay vuelto: recorta el efectivo
// extranjero del final al monto realmente aplicado (centavos hacia abajo) y
// agrega el residuo sub-centavo como efectivo en guaraníes. Devuelve null si no
// hay con qué registrarlo.
export function pagosSinVuelto(pagos, cuentas, totalGeneral) {
  let exceso = vueltoEfectivoExtranjero(pagos, cuentas, totalGeneral).exceso
  if (!(exceso > 0)) return pagos
  const salida = [...pagos]
  let residuo = 0
  for (let i = salida.length - 1; i >= 0 && exceso > 0; i--) {
    const p = salida[i]
    const c = (cuentas || []).find((a) => a.id === p.accountId)
    if (!c || c.kind !== 'CASH' || !FOREIGN(c.currency) || p.noPagado) continue
    const monto = Number(String(p.monto ?? '').replace(/\D/g, '')) || 0
    const quitar = Math.min(exceso, monto)
    const aplicado = monto - quitar
    exceso -= quitar
    if (aplicado <= 0) { salida.splice(i, 1); continue }
    const original = montoMaximoEnMoneda(aplicado, p.exchangeRatePyg)
    if (!original) { residuo += aplicado; salida.splice(i, 1); continue }
    const exacto = convertirAPyg(original.replace(',', '.'), String(p.exchangeRatePyg))
    residuo += aplicado - exacto
    salida[i] = { ...p, originalAmount: original, monto: String(exacto) }
  }
  if (residuo > 0) {
    const efectivo = cuentaEfectivoPyg(cuentas)
    if (!efectivo) return null
    salida.push({ medioPago: efectivo.name, cuenta: efectivo.name, accountId: efectivo.id, originalAmount: String(residuo), exchangeRatePyg: '', monto: String(residuo) })
  }
  return salida
}
