const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' })
export const stockBusinessDay = (now = new Date()) => dayFormat.format(now)
/** Próximo cambio de fecha en la zona de la tienda; no depende de la zona del teléfono. */
export function nextStockDayDelay(now = new Date()) {
  const start = now.getTime(), today = stockBusinessDay(now)
  let low = start, high = start + 27 * 60 * 60 * 1000
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2)
    if (stockBusinessDay(new Date(middle)) === today) low = middle
    else high = middle
  }
  return high - start + 1000
}
