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
assert.equal(destination.stock, 0, 'El stock de destino recién suma cuando se verifica la llegada del equipo.')

result = await request('/api/transfers')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const transfer = result.payload.find(item => item.id && item.lines?.some(line => line.sourceProductId === source.id))
assert.ok(transfer, 'El traslado no quedó en el historial.')

result = await request('/api/transfers', 'POST', { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', lines: [{ productId: source.id, quantity: 1, serials: [serial] }] })
assert.equal(result.response.status, 409, 'No se debe transferir de nuevo una unidad ya trasladada.')

result = await request(`/api/inventory-units?branchId=branch-a2-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
let movedUnit = result.payload.find(item => item.serial === normalizedSerial)
assert.ok(movedUnit, 'La unidad trasladada debe poder encontrarse por IMEI exacto.')
assert.equal(movedUnit.status, 'IN_TRANSIT', 'La unidad queda en tránsito hasta la verificación física en destino.')

result = await request('/api/inventory-units/verify', 'POST', { serial })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.receivedInTransit, 1, 'La verificación en destino debe recibir la unidad en tránsito.')

result = await request('/api/products')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.find(product => product.id === destination.id).stock, 1, 'La recepción debe sumar el stock de destino.')

result = await request(`/api/inventory-units?branchId=branch-a2-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
movedUnit = result.payload.find(item => item.serial === normalizedSerial)
assert.equal(movedUnit.status, 'AVAILABLE', 'La unidad recibida queda disponible.')

result = await request('/api/inventory-units', 'PATCH', { id: movedUnit.id, action: 'remove', reason: 'Prueba de baja recuperable' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'DEFECTIVE')

result = await request(`/api/inventory-units?branchId=branch-a2-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 0, 'La baja no debe aparecer en el inventario operativo.')

result = await request(`/api/inventory-units?branchId=branch-a2-it&view=removed&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 1, 'La baja debe aparecer en eliminados recuperables.')

result = await request('/api/inventory-units', 'PATCH', { id: movedUnit.id, action: 'restore', reason: 'Prueba de restauración auditada' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'AVAILABLE')

result = await request('/api/products')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.find(product => product.id === destination.id).stock, 1, 'La restauración debe recomponer el stock del destino.')

result = await request(`/api/inventory-units?view=removed&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 0, 'La unidad restaurada no debe seguir en eliminados.')

console.log('inventory-transfers: 31 checks OK (IMEI, stock, transfer, tránsito y recepción verificada, recuperable removal and audited restore).')
