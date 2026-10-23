import { getProductos, moverStock } from '@/lib/storage'
import { guardarDemo, leerDemo } from './demoStorage.js'
import { DEMO_PURCHASES } from './demo/compras.js'

// Compras demo (#324): la semilla pura vive en `demo/compras.js` (mismos
// proveedores que Inventario y Abastecimiento); acá quedan la persistencia
// session-only y las mutaciones de la pantalla Compras.
const KEY = 'mobos:demo-purchases:v1'
const seed = DEMO_PURCHASES

function read() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    return Array.isArray(guardado) && guardado.length ? guardado : seed
  } catch { return seed }
}
function write(items) { guardarDemo(KEY, JSON.stringify(items)); return items }
export function loadDemoPurchases() { return read() }
export function createDemoPurchase(purchase) {
  const nuevo = { payments: [], paidPyg: 0, outstandingPyg: 0, ...purchase }
  return write([nuevo, ...read()])
}
export function receiveDemoPurchase(id) {
  const items = read(); const purchase = items.find((item) => item.id === id)
  if (!purchase || purchase.status !== 'DRAFT') throw new Error('La compra ya fue recibida o no existe.')
  for (const line of purchase.lines || []) {
    if (!getProductos().some((product) => product.id === line.productId)) throw new Error('Producto demo inválido; no se actualizó el stock.')
  }
  for (const line of purchase.lines || []) moverStock(line.productId, Number(line.quantity))
  const lines = (purchase.lines || []).map((line) => ({ ...line, receivedQty: Number(line.quantity) }))
  const updated = { ...purchase, status: 'RECEIVED', receivedAt: new Date().toISOString(), lines, finalCostPyg: costoFinal(lines) }
  write(items.map((item) => item.id === id ? updated : item))
  return updated
}

// Costo final de la compra = suma de los costos finales de sus líneas.
function costoFinal(lines) {
  return (lines || []).reduce((total, line) => total + Number(line.finalTotalCostPyg ?? (Number(line.quantity) * Number(line.unitCostPyg))), 0)
}

export function updateDemoPurchaseCosts(id, lines) {
  const items = read(); const purchase = items.find((item) => item.id === id)
  if (!purchase || purchase.status !== 'DRAFT') throw new Error('Solo se pueden editar los costos de un borrador.')
  const byId = Object.fromEntries(lines.map((line) => [line.id, line]))
  const actualizadas = (purchase.lines || []).map((line) => {
    const next = byId[line.id]
    if (!next) return line
    const unitCostPyg = Number(next.unitCostPyg)
    return { ...line, unitCostPyg, baseTotalPyg: Number(line.quantity) * unitCostPyg, finalUnitCostPyg: unitCostPyg, finalTotalCostPyg: Number(line.quantity) * unitCostPyg }
  })
  const updated = { ...purchase, lines: actualizadas, finalCostPyg: costoFinal(actualizadas) }
  write(items.map((item) => item.id === id ? updated : item))
  return updated
}

// Recepcion total o parcial: suma el stock de lo recibido y deja la compra en
// PARTIAL o RECEIVED segun lo que falte (misma regla que el servidor).
export function receiveDemoPurchaseLines(id, lines) {
  const items = read(); const purchase = items.find((item) => item.id === id)
  if (!purchase || !['DRAFT', 'PARTIAL'].includes(purchase.status)) throw new Error('La compra ya fue recibida o no existe.')
  const pedidas = Array.isArray(lines) ? Object.fromEntries(lines.map((line) => [line.id, Number(line.quantity)])) : null
  const actualizadas = (purchase.lines || []).map((line) => {
    const recibido = Number(line.receivedQty || 0)
    const pendiente = Math.max(0, Number(line.quantity) - recibido)
    const cantidad = pedidas ? Math.min(pendiente, Math.max(0, pedidas[line.id] || 0)) : pendiente
    if (cantidad > 0) moverStock(line.productId, cantidad)
    return { ...line, receivedQty: recibido + cantidad }
  })
  const completa = actualizadas.every((line) => Number(line.receivedQty) >= Number(line.quantity))
  const updated = { ...purchase, status: completa ? 'RECEIVED' : 'PARTIAL', receivedAt: completa ? new Date().toISOString() : purchase.receivedAt, lines: actualizadas, finalCostPyg: costoFinal(actualizadas) }
  write(items.map((item) => item.id === id ? updated : item))
  return updated
}

// Devolucion al proveedor: baja el stock y deja constancia por linea.
export function returnDemoPurchase(id, { lines = [] } = {}) {
  const items = read(); const purchase = items.find((item) => item.id === id)
  if (!purchase) throw new Error('La compra no existe.')
  const pedidas = Object.fromEntries(lines.map((line) => [line.id, Number(line.quantity)]))
  const actualizadas = (purchase.lines || []).map((line) => {
    const cantidad = Math.max(0, pedidas[line.id] || 0)
    if (cantidad > 0) moverStock(line.productId, -cantidad)
    return { ...line, returnedQty: Number(line.returnedQty || 0) + cantidad }
  })
  const updated = { ...purchase, lines: actualizadas }
  write(items.map((item) => item.id === id ? updated : item))
  return updated
}

// Pago o anticipo a proveedor: suma el pago y baja el saldo por pagar.
export function payDemoPurchase(id, { originalAmount, exchangeRatePyg = 1, accountId = '', reference = '' } = {}, action = 'pay') {
  const items = read(); const purchase = items.find((item) => item.id === id)
  if (!purchase) throw new Error('La compra no existe.')
  const monto = Math.round(Number(originalAmount) * Number(exchangeRatePyg || 1))
  const pago = { id: `demo-pago-${Date.now().toString(36)}`, amountPyg: monto, accountId, reference, kind: action === 'advance' ? 'ADVANCE' : 'PAYMENT', paidAt: new Date().toISOString() }
  const pagado = Number(purchase.paidPyg || 0) + monto
  const updated = { ...purchase, payments: [...(purchase.payments || []), pago], paidPyg: pagado, outstandingPyg: Math.max(0, Number(purchase.finalCostPyg || 0) - pagado) }
  write(items.map((item) => item.id === id ? updated : item))
  return { payment: pago, purchase: updated }
}
