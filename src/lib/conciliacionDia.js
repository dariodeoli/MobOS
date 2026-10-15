export const MEDIOS_DIA = ['CASH', 'TRANSFER', 'CARD', 'TRADE_IN', 'PIX', 'CRYPTO']
export const claveGrupoDia = row => JSON.stringify([row.method, row.accountId || '', row.currency || 'PYG'])
export const diaParaguay = (value = new Date()) => { const time = new Date(value).getTime(); return Number.isFinite(time) ? new Date(time - 10800000).toISOString().slice(0, 10) : '' }
export function evaluarConciliacionDia(payments, declarations = null) {
  const groups = new Map(), seen = new Set()
  const group = row => {
    const key = claveGrupoDia(row)
    if (!groups.has(key)) groups.set(key, { key, method: row.method, accountId: row.accountId || null, currency: row.currency || 'PYG', label: row.label || row.method, expectedPyg: 0, receivedPyg: null, differencePyg: null, count: 0 })
    return groups.get(key)
  }
  group({ method: 'CASH', accountId: null, currency: 'PYG', label: 'Efectivo' })
  for (const payment of payments) {
    if (payment.status !== 'CONFIRMED' || !MEDIOS_DIA.includes(payment.method) || seen.has(payment.id)) continue
    seen.add(payment.id)
    const row = group(payment)
    row.expectedPyg += Number(payment.amountPyg); row.count++
  }
  for (const declaration of declarations || []) {
    const row = group(declaration)
    row.receivedPyg = declaration.receivedPyg
    row.differencePyg = declaration.receivedPyg - row.expectedPyg
  }
  const rows = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
  const missing = rows.filter(row => row.receivedPyg === null).length
  const differences = rows.filter(row => row.differencePyg !== null && row.differencePyg !== 0).length
  return { state: differences ? 'DIFFERENCE' : missing ? 'PENDING' : 'VERIFIED', groups: rows, missing, differences, expectedPyg: rows.reduce((sum, row) => sum + row.expectedPyg, 0), receivedPyg: rows.reduce((sum, row) => sum + (row.receivedPyg ?? 0), 0), differencePyg: rows.reduce((sum, row) => sum + (row.differencePyg ?? 0), 0) }
}
