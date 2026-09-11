import { getProductos, moverStock } from '@/lib/storage'

const KEY = 'mobos:demo-purchases:v1'
const seed = [
  { id: 'demo-purchase-1', supplierName: 'Proveedor demo A', status: 'RECEIVED', createdAt: '2026-01-12T10:00:00.000Z', receivedAt: '2026-01-14T10:00:00.000Z', shippingPyg: 85000, customsPyg: 120000, lines: [{ id: 'demo-line-1', productId: 'demo-funda-magsafe-transparente', productName: 'Funda MagSafe Transparente', quantity: 24, unitCostPyg: 18000 }] },
  { id: 'demo-purchase-2', supplierName: 'Proveedor demo B', status: 'DRAFT', createdAt: '2026-02-02T10:00:00.000Z', receivedAt: null, shippingPyg: 60000, customsPyg: 0, lines: [{ id: 'demo-line-2', productId: 'demo-cargador-usbc-20w', productName: 'Cargador USB-C 20W', quantity: 50, unitCostPyg: 9000 }] },
]

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || seed } catch { return seed }
}
function write(items) { localStorage.setItem(KEY, JSON.stringify(items)); return items }
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
  const updated = { ...purchase, status: 'RECEIVED', receivedAt: new Date().toISOString() }
  write(items.map((item) => item.id === id ? updated : item))
  return updated
}
