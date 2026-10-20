import assert from 'node:assert/strict'

const [baseUrl, adminToken, databaseUrl, sellerToken = ''] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl) throw new Error('Uso: inventory-apple-variant.mjs <baseUrl> <adminToken> <databaseUrl> [sellerToken]')
const { Client } = await import('pg')
const db = new Client({ connectionString: databaseUrl })
await db.connect()
const tag = `APPLE593-${Date.now()}`
const headers = { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', 'x-forwarded-for': '198.51.100.63', 'Content-Type': 'application/json' }
async function request(path, method, body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]

try {
  let result = await request('/api/products', 'POST', { sku: `${tag}-SKU`, name: 'iPhone 15 128GB', model: 'iPhone 15', capacity: '128GB', color: 'Negro', pricePyg: 3000000, stock: 0, branchId: 'branch-a-it' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const product = result.payload
  result = await request('/api/inventory-units', 'POST', { productId: product.id, branchId: 'branch-a-it', serial: `${tag}-IMEI`, condition: 'NEW', costPyg: 2000000 })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const unit = result.payload
  const before = await one('SELECT "status","branchId","costPyg" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  const stockBefore = await one('SELECT stock FROM "Product" WHERE id = $1', [product.id])

  if (sellerToken) {
    result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', model: 'iPhone 15 Pro' }, sellerToken)
    assert.equal(result.response.status, 403, 'un vendedor no edita la variante')
  }

  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Azul' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  const updated = await one('SELECT name,model,capacity,color,stock FROM "Product" WHERE id = $1', [product.id])
  assert.deepEqual({ model: updated.model, capacity: updated.capacity, color: updated.color }, { model: 'iPhone 15 Pro', capacity: '256GB', color: 'Azul' })
  assert.equal(Number(updated.stock), Number(stockBefore.stock), 'editar variante no cambia stock')
  const after = await one('SELECT "status","branchId","costPyg" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.deepEqual(after, before, 'editar variante no cambia unidad física')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'RESERVED\' WHERE id = $1', [unit.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', color: 'Azul oscuro' })
  assert.equal(result.response.status, 200, 'una unidad reservada puede corregir su variante de catálogo')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'AVAILABLE\' WHERE id = $1', [unit.id])

  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', model: 'x'.repeat(121) })
  assert.equal(result.response.status, 409, 'el límite de modelo se valida sin truncar')
  result = await request('/api/products', 'POST', { sku: `${tag}-GENERIC`, name: 'Cable USB 1M', pricePyg: 70000, stock: 0, branchId: 'branch-a-it' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const generic = result.payload
  result = await request('/api/inventory-units', 'POST', { productId: generic.id, branchId: 'branch-a-it', serial: `${tag}-CABLE`, condition: 'NEW' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  result = await request('/api/inventory-units', 'PATCH', { id: result.payload.id, action: 'variant', model: 'No Apple' })
  assert.equal(result.response.status, 409, 'un producto no Apple no acepta variante Apple')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'SOLD\' WHERE id = $1', [unit.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', color: 'Rojo' })
  assert.equal(result.response.status, 409, 'una unidad vendida conserva la variante histórica')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'AVAILABLE\' WHERE id = $1', [unit.id])
  await db.query('UPDATE "Product" SET "tenantId" = \'tenant-b-it\' WHERE id = $1', [product.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', color: 'Rojo' })
  assert.equal(result.response.status, 409, 'la variante nunca cruza el tenant del producto')
  await db.query('UPDATE "Product" SET "tenantId" = \'tenant-a-it\' WHERE id = $1', [product.id])
  assert.equal(Number((await one('SELECT stock FROM "Product" WHERE id = $1', [product.id])).stock), Number(stockBefore.stock), 'el stock se conserva luego de los rechazos')
  assert.equal((await one(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1 AND action = 'INVENTORY_APPLE_VARIANT_UPDATED'`, [product.id])).n, 2)
  console.log('inventory-apple-variant: OK')
} finally {
  await db.end()
}
