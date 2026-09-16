import assert from 'node:assert/strict'

// Verifica que un ADMIN sin sucursal (tenant sin Branch) no reciba 403:
// la primera ruta que exige sucursal debe auto-crear "Sucursal principal"
// y asignarla al usuario, de forma idempotente.
//
// Uso: store-branch.mjs <baseUrl> <adminTokenC>
// El harness siembra tenant-c-it sin Branch y user-c-admin-it sin branchId.
const [baseUrl, adminToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: store-branch.mjs <baseUrl> <adminTokenC>')

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-c-it', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
let result

// 1. GET /api/cash sin branchId: hoy debe responder 200 y no 403,
// auto-creando la sucursal del tenant.
result = await request('/api/cash')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))

// 2. El tenant queda con exactamente una sucursal activa auto-creada.
result = await request('/api/inventory-branches')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(Array.isArray(result.payload), 'inventory-branches debe devolver una lista.')
assert.equal(result.payload.length, 1, 'El tenant debe quedar con una única sucursal auto-creada.')
assert.equal(result.payload[0].name, 'Sucursal principal')
const branchId = result.payload[0].id

// 3. Idempotencia: una segunda petición no crea sucursales duplicadas.
result = await request('/api/cash')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/inventory-branches')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 1, 'El ensure no debe duplicar sucursales.')

// 4. POST /api/products sin branchId: se crea con la sucursal auto-asignada.
result = await request('/api/products', 'POST', { sku: `M-SB-${ts}`, name: 'Producto sucursal auto-creada', pricePyg: 100000, stock: 1 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.branchId, branchId, 'El producto debe quedar en la sucursal auto-creada.')

console.log('store-branch: checks OK (cash sin 403, sucursal auto-creada idempotente y producto asignado).')
