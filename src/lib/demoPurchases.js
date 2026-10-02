import { getProductos, moverStock } from '@/lib/storage'
import { leerDemo, guardarDemo } from './demoStorage.js'

const KEY = 'mobos:demo-purchases:v1'
// #307: los proveedores del demo son los mismos que el modal de Proveedores
// (`demoInventory`), para que Compras y el catálogo de proveedores no se
// contradigan. Los ids coinciden con `demoInventory`.
const seed = [
  { id: 'demo-purchase-1', supplierId: 'demo-prov-importadora', supplierName: 'Importadora Tecnológica S.A. ', status: 'RECEIVED', createdAt: '2026-01-12T10:00:00.000Z', receivedAt: '2026-01-14T10:00:00.000Z', shippingPyg: 85000, customsPyg: 120000, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0, currency: 'PYG', exchangeRatePyg: 1, creditEnabled: false, finalCostPyg: 637000, lines: [{ id: 'demo-line-1', productId: 'demo-funda-magsafe-transparente', productName: 'Funda MagSafe Transparente', quantity: 24, unitCostPyg: 18000, receivedQty: 24, baseTotalPyg: 432000, finalUnitCostPyg: 26542, finalTotalCostPyg: 637000 }] },
  { id: 'demo-purchase-2', supplierId: 'demo-prov-distribuidora', supplierName: 'Distribuidora del Este ', status: 'DRAFT', createdAt: '2026-02-02T10:00:00.000Z', receivedAt: null, shippingPyg: 60000, customsPyg: 0, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0, currency: 'PYG', exchangeRatePyg: 1, creditEnabled: false, finalCostPyg: 510000, lines: [{ id: 'demo-line-2', productId: 'demo-cargador-usbc-20w', productName: 'Cargador USB-C 20W', quantity: 50, unitCostPyg: 9000, receivedQty: 0, baseTotalPyg: 450000, finalUnitCostPyg: 10200, finalTotalCostPyg: 510000 }] },
]

function read() {
  try { return JSON.parse(leerDemo(KEY)) || seed } catch { return seed }
}
function write(items) { guardarDemo(KEY, JSON.stringify(items)); return items }
export const DEMO_PURCHASES = seed
export function loadDemoPurchases() { return read() }
export function createDemoPurchase(purchase) { return write([purchase, ...read()]) }
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
