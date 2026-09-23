// Cuentas de cobro: conversión de un pago a guaraníes y actualización de una
// fila al editarla. Sin JSX ni React para poder testear la regla de la
// cotización (la automática del servicio nunca pisa la escrita a mano, #173-A).

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
  const amountPyg = Math.round(originalAmount * exchangeRatePyg)
  if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0) throw new Error('El monto convertido en PYG no es válido.')
  const tradeIn = account.kind === 'TRADE_IN' ? {
    serial: (payment.tradeIn?.serial || '').trim(),
    model: (payment.tradeIn?.model || '').trim(),
    conditionNotes: (payment.tradeIn?.conditionNotes || '').trim(),
  } : undefined
  if (tradeIn && (!tradeIn.serial || !tradeIn.model || !tradeIn.conditionNotes)) throw new Error('El canje requiere serial, modelo y condición del equipo recibido.')
  return { accountId: account.id, originalAmount, exchangeRatePyg, amountPyg, method: account.kind, status: 'CONFIRMED', ...(tradeIn ? { tradeIn } : {}) }
}

// El campo legacy monto siempre representa guaraníes, incluso al ingresar USD/BRL.
// `automatico` marca la cotización sugerida por el servicio (#173-A): nunca pisa
// una cotización que ya esté cargada, porque la consulta puede volver después de
// que el vendedor la escriba a mano.
export function updateAccountPayment(payment, change, accounts) {
  const { automatico, ...cambios } = change
  if (automatico && Number(payment.exchangeRatePyg) > 0) return payment
  const next = { ...payment, ...cambios }
  const account = accounts.find((a) => a.id === next.accountId && a.isActive)
  const original = decimal(next.originalAmount)
  const rate = FOREIGN(account?.currency) ? decimal(next.exchangeRatePyg) : 1
  const amount = Math.round(original * rate)
  return { ...next, medioPago: account?.name || '', cuenta: account?.name || '', monto: account && original > 0 && rate > 0 && Number.isSafeInteger(amount) ? String(amount) : '' }
}
