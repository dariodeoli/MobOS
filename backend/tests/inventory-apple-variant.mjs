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
  const before = await one('SELECT "status","branchId","costPyg",serial,"locationId",condition,"productId","originalCost","costCurrency","exchangeRatePyg" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  const stockBefore = await one('SELECT stock FROM "Product" WHERE id = $1', [product.id])
  await db.query(`INSERT INTO "Order" (id,"tenantId","branchId","sellerId","orderNumber","subtotalPyg","totalPyg","receiptSnapshot","updatedAt") VALUES ($1,'tenant-a-it','branch-a-it','user-admin-it',$1,3000000,3000000,'{"title":"Original receipt","model":"iPhone 15"}',CURRENT_TIMESTAMP)`, [tag])
  await db.query(`INSERT INTO "OrderItem" (id,"orderId","productId",description,quantity,"unitPricePyg","totalPyg") VALUES ($1,$2,$3,'Original iPhone 15 128GB Negro',1,3000000,3000000)`, [`${tag}-item`, tag, product.id])
  const documentBefore = await one('SELECT row_to_json(o)::text AS snapshot FROM "Order" o WHERE id = $1', [tag])
  const lineBefore = await one('SELECT row_to_json(i)::text AS snapshot FROM "OrderItem" i WHERE id = $1', [`${tag}-item`])


  if (sellerToken) {
    result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'iPhone 15 Pro' }, sellerToken)
    assert.equal(result.response.status, 403, 'un vendedor no edita la variante')
  }

  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', color: 'No consent' })
  assert.equal(result.response.status, 400, 'global catalog change requires explicit scope')
  // The isolated fixture changes actor role/branch and restores it in finally.
  for (const role of ['VENDEDOR', 'CAJERA', 'TECNICO', 'REPARTIDOR']) {
    await db.query('UPDATE "User" SET role = $1::"UserRole" WHERE id = \'user-admin-it\'', [role])
    result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Denied' })
    assert.equal(result.response.status, 403, `${role} cannot edit variant`)
  }
  await db.query('UPDATE "User" SET role = \'GERENTE\', "branchId" = \'branch-a2-it\' WHERE id = \'user-admin-it\'')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Wrong branch' })
  assert.equal(result.response.status, 403, 'manager from another branch denied')
  await db.query('UPDATE "User" SET "branchId" = \'branch-a-it\' WHERE id = \'user-admin-it\'')
  await db.query('UPDATE "User" SET permissions = \'["stock:manage"]\'::jsonb WHERE id = \'user-admin-it\'')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'No product permission' })
  assert.equal(result.response.status, 403, 'stock permission does not grant catalog editing')
  await db.query('UPDATE "User" SET permissions = NULL WHERE id = \'user-admin-it\'')

  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Azul' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  const updated = await one('SELECT name,model,capacity,color,stock FROM "Product" WHERE id = $1', [product.id])
  assert.deepEqual({ model: updated.model, capacity: updated.capacity, color: updated.color }, { model: 'iPhone 15 Pro', capacity: '256GB', color: 'Azul' })
  assert.equal(Number(updated.stock), Number(stockBefore.stock), 'editar variante no cambia stock')
  const auditBeforeRetry = await one('SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1', [product.id])
  const productBeforeRetry = await one('SELECT "updatedAt"::text AS stamp FROM "Product" WHERE id = $1', [product.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Azul' })
  assert.equal(result.response.status, 200)
  assert.deepEqual(await one('SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1', [product.id]), auditBeforeRetry, 'retry does not duplicate audit')
  assert.deepEqual(await one('SELECT "updatedAt"::text AS stamp FROM "Product" WHERE id = $1', [product.id]), productBeforeRetry, 'retry does not write product')
  await db.query('UPDATE "User" SET role = \'ADMIN\' WHERE id = \'user-admin-it\'')
  const retries = await Promise.all(Array.from({ length: 2 }, () => request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Azul' })))
  assert.ok(retries.every(r => r.response.status === 200), 'concurrent no-op retries succeed')
  assert.deepEqual(await one('SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1', [product.id]), auditBeforeRetry, 'concurrent retries do not duplicate audit')
  const after = await one('SELECT "status","branchId","costPyg",serial,"locationId",condition,"productId","originalCost","costCurrency","exchangeRatePyg" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.deepEqual(after, before, 'editar variante no cambia unidad física')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'RESERVED\' WHERE id = $1', [unit.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Azul oscuro' })
  assert.equal(result.response.status, 200, 'una unidad reservada puede corregir su variante de catálogo')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'AVAILABLE\' WHERE id = $1', [unit.id])

  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Servicio', status: 'SERVICE', costPyg: 1, serial: 'FORBIDDEN', branchId: 'branch-a2-it', stock: 999 })
  assert.equal(result.response.status, 200, 'catalog editing ignores physical-state payloads')
  assert.deepEqual(await one('SELECT "status","branchId","costPyg",serial,"locationId",condition,"productId","originalCost","costCurrency","exchangeRatePyg" FROM "InventoryUnit" WHERE id = $1', [unit.id]), before, 'SERVICE is not a persisted InventoryUnitStatus and cannot be injected through catalog editing')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'Samsung Galaxy Watch' })
  assert.equal(result.response.status, 409, 'an Apple variant cannot change to a contradictory non-Apple model')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: { invalid: true } })
  assert.equal(result.response.status, 409, 'non-string metadata rejected')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'x'.repeat(121) })
  assert.equal(result.response.status, 409, 'el límite de modelo se valida sin truncar')
  result = await request('/api/products', 'POST', { sku: `${tag}-GENERIC`, name: 'Cable USB 1M', pricePyg: 70000, stock: 0, branchId: 'branch-a-it' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const generic = result.payload
  result = await request('/api/inventory-units', 'POST', { productId: generic.id, branchId: 'branch-a-it', serial: `${tag}-CABLE`, condition: 'NEW' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  result = await request('/api/inventory-units', 'PATCH', { id: result.payload.id, action: 'variant', variantScope: 'PRODUCT', model: 'No Apple' })
  assert.equal(result.response.status, 409, 'un producto no Apple no acepta variante Apple')
  for (const [name, model, accepted] of [
    ['Samsung Galaxy Watch', 'Samsung Galaxy Watch', false],
    ['Correa Apple Watch', 'Apple Watch Series 9', false],
    ['Apple Watch Series 9', 'Apple Watch Series 9', true],
    ['Watch Series 9', 'Watch Series 9', true],
  ]) {
    result = await request('/api/products', 'POST', { sku: `${tag}-${name.replace(/\s/g, '')}`, name, model, category: 'WATCH', pricePyg: 100000, stock: 0, branchId: 'branch-a-it' })
    assert.equal(result.response.status, 201, JSON.stringify(result.payload))
    const candidateProduct = result.payload
    result = await request('/api/inventory-units', 'POST', { productId: candidateProduct.id, branchId: 'branch-a-it', serial: `${tag}-${name.replace(/\s/g, '')}`, condition: 'NEW' })
    assert.equal(result.response.status, 201, JSON.stringify(result.payload))
    const candidateUnit = result.payload
    result = await request('/api/inventory-units', 'PATCH', { id: candidateUnit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Plateado' })
    assert.equal(result.response.status, accepted ? 200 : 409, name)
    assert.equal((await one('SELECT color FROM "Product" WHERE id = $1', [candidateProduct.id])).color, accepted ? 'Plateado' : null, `${name}: classification cannot mutate rejected product`)
  }
  await db.query('UPDATE "InventoryUnit" SET "status" = \'SOLD\' WHERE id = $1', [unit.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Rojo' })
  assert.equal(result.response.status, 409, 'una unidad vendida conserva la variante histórica')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'AVAILABLE\' WHERE id = $1', [unit.id])
  await db.query('UPDATE "InventoryUnit" SET "tenantId" = \'tenant-b-it\' WHERE id = $1', [unit.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Other tenant unit' })
  assert.equal(result.response.status, 404, 'unit from another tenant is not visible')
  await db.query('UPDATE "InventoryUnit" SET "tenantId" = \'tenant-a-it\' WHERE id = $1', [unit.id])
  await db.query('UPDATE "Product" SET "branchId" = \'branch-a2-it\' WHERE id = $1', [product.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Wrong product branch' })
  assert.equal(result.response.status, 409, 'catalog branch follows canonical Product PATCH restriction')
  await db.query('UPDATE "Product" SET "branchId" = \'branch-a-it\' WHERE id = $1', [product.id])
  await db.query('UPDATE "Product" SET "tenantId" = \'tenant-b-it\' WHERE id = $1', [product.id])
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'variant', variantScope: 'PRODUCT', color: 'Rojo' })
  assert.equal(result.response.status, 409, 'la variante nunca cruza el tenant del producto')
  await db.query('UPDATE "Product" SET "tenantId" = \'tenant-a-it\' WHERE id = $1', [product.id])
  assert.equal(Number((await one('SELECT stock FROM "Product" WHERE id = $1', [product.id])).stock), Number(stockBefore.stock), 'el stock se conserva luego de los rechazos')
  assert.equal((await one(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1 AND action = 'INVENTORY_APPLE_VARIANT_UPDATED'`, [product.id])).n, 3)
  assert.deepEqual(await one('SELECT row_to_json(o)::text AS snapshot FROM "Order" o WHERE id = $1', [tag]), documentBefore, 'receipt snapshot preserved')
  assert.deepEqual(await one('SELECT row_to_json(i)::text AS snapshot FROM "OrderItem" i WHERE id = $1', [`${tag}-item`]), lineBefore, 'historical order line preserved')
  console.log('inventory-apple-variant: OK')
} finally {
  await db.query('UPDATE "User" SET role = \'ADMIN\', permissions = NULL, "branchId" = \'branch-a-it\' WHERE id = \'user-admin-it\'')
  await db.end()
}
