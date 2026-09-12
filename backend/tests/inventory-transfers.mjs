import assert from 'node:assert/strict'

const [baseUrl, adminToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: inventory-transfers.mjs <baseUrl> <adminToken>')

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const serial = `TRANSFER-IMEI-${Date.now()}`
const normalizedSerial = serial.replace(/[\s-]+/g, '').toUpperCase()
const sku = `TRANSFER-SKU-${Date.now()}`
let result = await request('/api/products', 'POST', { sku, name: 'Equipo serializado de transferencia', pricePyg: 950000, costPyg: 700000, stock: 1, branchId: 'branch-a-it', imei: serial })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const source = result.payload

result = await request('/api/transfers', 'POST', { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', notes: 'Prueba de traslado IMEI', lines: [{ productId: source.id, quantity: 1, serials: [serial] }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.lines.length, 1)
assert.deepEqual(result.payload.lines[0].serials, [normalizedSerial])

result = await request('/api/products')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const sourceAfter = result.payload.find(product => product.id === source.id)
const destination = result.payload.find(product => product.sku === sku && product.branchId === 'branch-a2-it')
assert.equal(sourceAfter.stock, 0)
assert.ok(destination, 'No se creó el inventario de destino.')
assert.equal(destination.stock, 1)

result = await request('/api/transfers')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const transfer = result.payload.find(item => item.id && item.lines?.some(line => line.sourceProductId === source.id))
assert.ok(transfer, 'El traslado no quedó en el historial.')

result = await request('/api/transfers', 'POST', { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', lines: [{ productId: source.id, quantity: 1, serials: [serial] }] })
assert.equal(result.response.status, 409, 'No se debe transferir de nuevo una unidad ya trasladada.')

console.log('inventory-transfers: 10 checks OK (IMEI unit, stock, destination and immutable transfer history).')
