import assert from 'node:assert/strict'
import pg from 'pg'

// U1 · Stock unificado por HTTP + base real: tipo de stock al crear, baja y
// restauración atómicas (campo + auditoría), venta/anulación con vínculo de
// línea, recomputo sin unidades dadas de baja y el chequeo de consistencia.
const [baseUrl, adminToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl) throw new Error('Uso: stock-unificado.mjs <baseUrl> <adminToken> <databaseUrl>')

// IP propia: el arnés comparte el cupo de 120 pedidos/min de 127.0.0.1 entre todas las suites sin IP.
const CLIENT_IP = '198.51.100.62'
async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', 'x-forwarded-for': CLIENT_IP, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]

try {
  const marca = Date.now()
  const serial = `U1-IMEI-${marca}`
  const normalized = serial.replace(/[\s-]+/g, '').toUpperCase()

  // Alta: tipo de stock EQUIPO (tiene IMEI) y accesorio por categoría.
  let result = await request('/api/products', 'POST', { sku: `U1-SKU-${marca}`, name: 'Equipo U1', category: 'Accesorios', pricePyg: 1000000, costPyg: 800000, stock: 1, branchId: 'branch-a-it', imei: serial })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const product = result.payload
  assert.equal((await one('SELECT "stockKind" FROM "Product" WHERE id = $1', [product.id])).stockKind, 'EQUIPO', 'un producto con IMEI es EQUIPO aunque la categoría diga accesorio')
  result = await request('/api/products', 'POST', { sku: `U1-ACC-${marca}`, name: 'Funda U1', category: 'Fundas', pricePyg: 50000, stock: 5, branchId: 'branch-a-it' })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  assert.equal((await one('SELECT "stockKind" FROM "Product" WHERE id = $1', [result.payload.id])).stockKind, 'ACCESORIO')

  result = await request(`/api/inventory-units?branchId=branch-a-it&q=${encodeURIComponent(serial)}`)
  const unit = result.payload.find(row => row.serial === normalized)
  assert.ok(unit, 'La unidad debe existir.')
  const stockDe = async () => Number((await one('SELECT stock FROM "Product" WHERE id = $1', [product.id])).stock)
  assert.equal(await stockDe(), 1)

  // Baja: campo + auditoría + stock, y desaparece de la vista activa.
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'remove', reason: 'Baja de prueba U1' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  let fila = await one('SELECT "removedAt","removedById","removedReason","status" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.ok(fila.removedAt, 'removedAt queda escrito')
  assert.ok(fila.removedById, 'removedById queda escrito')
  assert.equal(fila.removedReason, 'Baja de prueba U1')
  assert.equal((await one(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1 AND action = 'INVENTORY_UNIT_REMOVED'`, [unit.id])).n, 1, 'la auditoría de baja se escribe junto con el campo')
  assert.equal(await stockDe(), 0)
  result = await request(`/api/inventory-units?branchId=branch-a-it&view=removed&q=${encodeURIComponent(serial)}`)
  assert.ok(result.payload.some(row => row.id === unit.id), 'la vista «removed» sale del campo')
  result = await request(`/api/inventory-units?branchId=branch-a-it&view=active&q=${encodeURIComponent(serial)}`)
  assert.ok(!result.payload.some(row => row.id === unit.id), 'la vista activa excluye la baja')
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'remove', reason: 'Otra vez' })
  assert.equal(result.response.status, 409, 'no se puede dar de baja dos veces')

  // La verificación de consistencia coincide con la auditoría.
  const consistencia = await import('node:child_process').then(({ spawnSync }) => spawnSync(process.execPath, [new URL('./stock-consistency.mjs', import.meta.url).pathname], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' }))
  assert.equal(consistencia.status, 0, consistencia.stdout + consistencia.stderr)
  assert.match(consistencia.stdout, /removedAt coincide con la auditoría/)

  // Desfase sembrado: el chequeo lo informa (falla) y NO lo corrige solo.
  await db.query('UPDATE "InventoryUnit" SET "removedAt" = NULL WHERE id = $1', [unit.id])
  const desfasado = (await import('node:child_process')).spawnSync(process.execPath, [new URL('./stock-consistency.mjs', import.meta.url).pathname], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' })
  assert.equal(desfasado.status, 1, desfasado.stdout)
  assert.match(desfasado.stdout, /BAJA .*removedAt=no auditoría=baja/)
  assert.equal((await one('SELECT "removedAt" FROM "InventoryUnit" WHERE id = $1', [unit.id])).removedAt, null, 'el chequeo no corrige solo')
  await db.query('UPDATE "InventoryUnit" SET "removedAt" = now() WHERE id = $1', [unit.id])

  // Restaurar: limpia los tres campos y deja la auditoría.
  result = await request('/api/inventory-units', 'PATCH', { id: unit.id, action: 'restore', reason: 'Restauración U1' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  fila = await one('SELECT "removedAt","removedById","removedReason","status" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.equal(fila.removedAt, null)
  assert.equal(fila.removedById, null)
  assert.equal(fila.removedReason, null)
  assert.equal(fila.status, 'AVAILABLE')
  assert.equal((await one(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = $1 AND action = 'INVENTORY_UNIT_RESTORED'`, [unit.id])).n, 1)
  assert.equal(await stockDe(), 1)

  // Venta: la unidad queda enlazada a su línea; anular limpia el vínculo.
  result = await request('/api/orders', 'POST', { items: [{ productId: product.id, description: product.name, quantity: 1, unitPricePyg: 1000000, inventoryUnitSerials: [normalized] }] })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const order = result.payload
  const linea = await one('SELECT id FROM "OrderItem" WHERE "orderId" = $1', [order.id])
  fila = await one('SELECT status, "soldOrderItemId", "soldAt" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.equal(fila.status, 'SOLD')
  assert.equal(fila.soldOrderItemId, linea.id, 'la unidad vendida apunta a su línea de venta')
  assert.ok(fila.soldAt, 'soldAt queda escrito')
  result = await request(`/api/orders/${order.id}/void`, 'POST', { reason: 'Anulación U1' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  fila = await one('SELECT status, "soldOrderItemId", "soldAt" FROM "InventoryUnit" WHERE id = $1', [unit.id])
  assert.equal(fila.status, 'AVAILABLE')
  assert.equal(fila.soldOrderItemId, null, 'anular limpia el vínculo')
  assert.equal(fila.soldAt, null)
  assert.equal(await stockDe(), 1)

  console.log('stock-unificado: OK')
} finally {
  await db.end()
}
