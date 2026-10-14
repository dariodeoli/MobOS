import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pg from 'pg'

// #400 (unidad B): el nombre real del proveedor nunca llega a VENDEDOR/CAJERA,
// ni siquiera cuando el dueño les deja ver costos (el default). Se recorre cada
// ruta que devuelve proveedor y se busca el texto del nombre en la respuesta
// cruda. Gerencia y administración siguen viéndolo.
// Uso: supplier-sigla-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <databaseUrl>
const [baseUrl, adminToken, sellerToken, cajeraToken, gerenteToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !gerenteToken || !databaseUrl) throw new Error('Uso: supplier-sigla-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <databaseUrl>')

const CLIENT_IP = '198.51.100.62'
const BRANCH = 'branch-a-it'
async function request(path, { method = 'GET', body, token = adminToken } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it', 'x-forwarded-for': CLIENT_IP, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const raw = await response.text()
  let payload = null
  try { payload = JSON.parse(raw) } catch { /* csv u otro texto */ }
  return { status: response.status, raw, payload }
}
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()

try {
  const marca = Date.now()
  const NOMBRE = `Mayorista Secreto Norte ${marca}`
  const NOMBRE_SIN_SIGLA = `Importadora Callejera ${marca}`
  const SIGLA = `MS${String(marca).slice(-4)}`
  const roles = { VENDEDOR: sellerToken, CAJERA: cajeraToken }

  // El caso peligroso: vendedores y caja VEN costos (default productivo).
  let r = await request('/api/tenant/cost-visibility', { method: 'PUT', body: { sellerSeesCosts: true } })
  assert.equal(r.status, 200, r.raw)

  // ── Datos: proveedor con sigla, proveedor sin sigla, unidades, compra, deuda, repuesto, autorización.
  r = await request('/api/suppliers', { method: 'POST', body: { name: NOMBRE, code: SIGLA } })
  assert.equal(r.status, 201, r.raw)
  const proveedor = r.payload
  r = await request('/api/suppliers', { method: 'POST', body: { name: NOMBRE_SIN_SIGLA } })
  assert.equal(r.status, 201, r.raw)
  const sinSigla = r.payload

  const tag = `SG${marca}`
  r = await request('/api/products', { method: 'POST', body: { sku: `${tag}-EQ`, name: `Equipo ${tag}`, category: 'Celulares', model: 'SG', capacity: '128GB', color: 'Negro', pricePyg: 3000000, costPyg: 2000000, stock: 0, branchId: BRANCH } })
  assert.equal(r.status, 201, r.raw)
  const producto = r.payload
  r = await request('/api/inventory-units', { method: 'POST', body: { productId: producto.id, branchId: BRANCH, serials: [`${tag}-1`, `${tag}-2`], costPyg: 2100000, supplierId: proveedor.id, supplierName: NOMBRE } })
  assert.equal(r.status, 201, r.raw)
  r = await request('/api/inventory-units', { method: 'POST', body: { productId: producto.id, branchId: BRANCH, serial: `${tag}-3`, costPyg: 2100000, supplierId: sinSigla.id } })
  assert.equal(r.status, 201, r.raw)
  const unidades = (await db.query('SELECT id, serial FROM "InventoryUnit" WHERE "productId" = $1 ORDER BY serial', [producto.id])).rows
  assert.equal(unidades.length, 3)

  r = await request('/api/purchases', { method: 'POST', body: { supplierName: NOMBRE, supplierId: proveedor.id, branchId: BRANCH, lines: [{ productId: producto.id, quantity: 2, unitCostPyg: 2000000, lotReference: `LOTE-${tag}` }] } })
  assert.equal(r.status, 201, r.raw)
  const compra = r.payload
  r = await request('/api/purchases', { method: 'PATCH', body: { id: compra.id, action: 'receive' } })
  assert.equal(r.status, 200, r.raw)
  // Devolución al proveedor: el kardex arma texto con el proveedor de la compra.
  r = await request('/api/purchases', { method: 'PATCH', body: { id: compra.id, action: 'return', reason: `Falla ${tag}`, lines: [{ lineId: compra.lines[0].id, quantity: 1 }] } })
  assert.ok([200, 201, 400, 409].includes(r.status), r.raw)

  r = await request('/api/finance', { method: 'POST', body: { action: 'supplierPayable', supplierName: NOMBRE, supplierId: proveedor.id, concept: `Repuestos ${tag}`, condition: 'CREDITO', amountPyg: 500000, dueAt: '2099-01-10T00:00:00.000Z' } })
  assert.equal(r.status, 201, r.raw)
  r = await request('/api/workshop/parts', { method: 'POST', body: { name: `Pantalla ${tag}`, ownership: 'PROVEEDOR', paymentMode: 'CREDITO', supplierId: proveedor.id, quantity: 2, unitCostPyg: 80000, dueAt: '2099-02-01T00:00:00.000Z', branchId: BRANCH, notes: `Pedido a ${NOMBRE}` } })
  assert.equal(r.status, 201, r.raw)
  const repuesto = r.payload
  await db.query(
    `INSERT INTO "CustomerAuthorization" ("id", "tenantId", "kind", "status", "entity", "entityId", "requestedValue", "requestedById", "note") VALUES ($1, 'tenant-a-it', 'PURCHASE_CREDIT', 'PENDING', 'PurchaseOrder', $2, $3::jsonb, 'user-a-it', $4)`,
    [`auth-sg-${marca}`, proveedor.id, JSON.stringify({ totalPyg: 900000, supplierId: proveedor.id, supplierName: NOMBRE }), `Compra a ${NOMBRE}`],
  )
  await db.query(
    `INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES ($1, 'tenant-a-it', 'user-admin-it', 'PRODUCT_UPDATED', 'Product', $2, $3::jsonb)`,
    [`audit-sg-${marca}`, producto.id, JSON.stringify({ supplierName: NOMBRE, nota: `ver ${NOMBRE}` })],
  )

  // ── Rutas que un vendedor o cajera puede abrir: nunca el nombre real.
  const rutas = [
    ['stock/items', `/api/stock/items?q=${tag}&limit=200`],
    ['stock/items (todo)', '/api/stock/items?limit=200'],
    ['inventory-units', `/api/inventory-units?productId=${producto.id}`],
    ['inventory-units (busca)', `/api/inventory-units?q=${tag}`],
    ['kardex json', `/api/products/${producto.id}/kardex`],
    ['kardex csv', `/api/products/${producto.id}/kardex?format=csv`],
    ['products/history', `/api/products/${producto.id}/history`],
    ['products', '/api/products?limit=500'],
    ['products (página)', '/api/products?page=1'],
    ['workshop/parts', '/api/workshop/parts'],
    ['workshop/parts?id', `/api/workshop/parts?id=${repuesto.id}`],
    ['authorizations', '/api/authorizations'],
    ['authorizations mine', '/api/authorizations?mine=1&kind=PURCHASE_CREDIT'],
    ['exports unidades', '/api/exports/inventory-units'],
    ['exports unidades csv q', `/api/exports/inventory-units?q=${tag}`],
  ]
  for (const [rol, token] of Object.entries(roles)) {
    for (const [nombre, ruta] of rutas) {
      r = await request(ruta, { token })
      assert.ok([200, 403].includes(r.status), `${rol} ${nombre}: ${r.status} ${r.raw.slice(0, 200)}`)
      assert.ok(!r.raw.includes(NOMBRE) && !r.raw.includes(NOMBRE_SIN_SIGLA) && !r.raw.includes('Mayorista Secreto'), `${rol} ${nombre}: apareció el nombre real del proveedor`)
    }
    // Las que deben responder 200 y mostrar la sigla.
    r = await request(`/api/stock/items?q=${tag}&limit=200`, { token })
    assert.equal(r.status, 200, r.raw)
    const filas = r.payload.items.filter(fila => fila.kind === 'unit')
    assert.equal(filas.length, 3)
    assert.deepEqual([...new Set(filas.map(fila => fila.supplierName))].sort(), ['S/S', SIGLA].sort(), `${rol}: stock/items muestra la sigla`)
    r = await request(`/api/inventory-units?productId=${producto.id}`, { token })
    assert.equal(r.status, 200, r.raw)
    for (const unidad of r.payload) {
      assert.ok(['S/S', SIGLA].includes(unidad.supplierName), `${rol}: supplierName es la sigla`)
      assert.deepEqual(Object.keys(unidad.supplier).sort(), ['code', 'id'], `${rol}: supplier es solo el badge`)
    }
    const conSigla = r.payload.find(unidad => unidad.supplier.code === SIGLA)
    assert.equal(conSigla.supplier.id, proveedor.id)
    assert.ok(r.payload.some(unidad => unidad.supplier.code === 'S/S'), 'sin sigla: S/S, nunca iniciales del nombre')
    r = await request(`/api/products/${producto.id}/kardex`, { token })
    assert.equal(r.status, 200, r.raw)
    assert.ok(r.raw.includes(SIGLA), `${rol}: el kardex muestra la sigla de la compra`)
    r = await request(`/api/products/${producto.id}/history`, { token })
    assert.equal(r.status, 200, r.raw)
    r = await request('/api/exports/inventory-units', { token })
    assert.equal(r.status, 200)
    assert.ok(r.raw.includes('Proveedor') && r.raw.includes(SIGLA), `${rol}: la columna Proveedor del CSV lleva la sigla`)
    r = await request(`/api/workshop/parts?id=${repuesto.id}`, { token })
    assert.equal(r.status, 200, r.raw)
    assert.equal(r.payload.part.supplier.code, SIGLA)
    assert.equal(r.payload.part.supplier.name, undefined)
  }

  // Autorización: el vendedor que la pidió ve la metadata con la sigla.
  r = await request('/api/authorizations?mine=1&kind=PURCHASE_CREDIT', { token: sellerToken })
  assert.equal(r.status, 200, r.raw)
  const auth = r.payload.find(fila => fila.id === `auth-sg-${marca}`)
  assert.ok(auth, 'el vendedor ve su solicitud')
  assert.equal(auth.requestedValue.supplierName, SIGLA)

  // ── Caja: finanzas (compras, cuentas por pagar, repuestos, asientos) y compras.
  r = await request('/api/finance', { token: cajeraToken })
  assert.equal(r.status, 200, r.raw)
  assert.ok(!r.raw.includes(NOMBRE) && !r.raw.includes('Mayorista Secreto'), 'CAJERA: /api/finance no lleva el nombre real')
  assert.ok(r.payload.supplierPayables.rows.some(fila => fila.supplierName === SIGLA), 'cuentas por pagar con sigla')
  assert.ok(r.payload.workshopParts.rows.some(fila => fila.supplierName === SIGLA), 'repuestos con sigla')
  assert.ok(r.payload.payables.rows.some(fila => fila.supplierName === SIGLA), 'compras por pagar con sigla')
  r = await request('/api/purchases', { token: cajeraToken })
  assert.equal(r.status, 200, r.raw)
  assert.ok(!r.raw.includes(NOMBRE) && !r.raw.includes('Mayorista Secreto'), 'CAJERA: /api/purchases no lleva el nombre real')
  assert.ok(r.payload.some(fila => fila.id === compra.id && fila.supplierName === SIGLA))
  r = await request(`/api/purchases?q=${encodeURIComponent('Secreto')}`, { token: cajeraToken })
  assert.equal(r.status, 200, r.raw)
  assert.equal(r.payload.length, 0, 'buscar por nombre no sirve de oráculo para la caja')
  r = await request('/api/exports/purchases', { token: cajeraToken })
  assert.equal(r.status, 200)
  assert.ok(!r.raw.includes(NOMBRE) && r.raw.includes(SIGLA), 'export de compras para caja: sigla')
  r = await request('/api/exports/cash-movements', { token: cajeraToken })
  assert.ok(!r.raw.includes(NOMBRE), 'export de movimientos para caja sin nombre real')

  // ── Rutas de proveedor/abastecimiento: solo administración y gerencia.
  const soloGerencia = [
    '/api/suppliers', `/api/suppliers/${proveedor.id}/balance`, `/api/suppliers/${proveedor.id}/history`,
    `/api/purchases/${compra.id}`, `/api/purchases/${compra.id}/history`,
    `/api/inventory-units/${unidades[0].id}/history`,
    '/api/supply/purchases', '/api/supply/shipments', '/api/supply/performance', `/api/supply/serials/${tag}-1`,
  ]
  for (const [rol, token] of Object.entries(roles)) {
    for (const ruta of soloGerencia) {
      r = await request(ruta, { token })
      assert.equal(r.status, 403, `${rol} ${ruta}: debería ser 403 y fue ${r.status}`)
    }
  }
  r = await request('/api/purchases', { token: sellerToken })
  assert.equal(r.status, 403, 'VENDEDOR no abre compras')
  r = await request('/api/exports/purchases', { token: sellerToken })
  assert.equal(r.status, 403)

  // ── Badges: solo {id, code, icon, color} y nunca el nombre.
  for (const token of [sellerToken, cajeraToken, gerenteToken, adminToken]) {
    r = await request('/api/suppliers/badges', { token })
    assert.equal(r.status, 200, r.raw)
    assert.ok(Array.isArray(r.payload) && r.payload.length >= 2)
    for (const badge of r.payload) assert.deepEqual(Object.keys(badge).sort(), ['code', 'color', 'icon', 'id'])
    assert.ok(r.payload.some(badge => badge.id === proveedor.id && badge.code === SIGLA))
    assert.ok(r.payload.some(badge => badge.id === sinSigla.id && badge.code === 'S/S'))
    assert.ok(!r.raw.includes('Mayorista Secreto') && !r.raw.includes('Importadora Callejera'))
  }

  // ── Gerencia y administración siguen viendo el nombre real.
  for (const token of [adminToken, gerenteToken]) {
    r = await request(`/api/stock/items?q=${tag}&limit=200`, { token })
    assert.equal(r.status, 200, r.raw)
    assert.ok(r.payload.items.some(fila => fila.supplierName === NOMBRE), 'gerencia ve el nombre en stock/items')
    r = await request(`/api/inventory-units?productId=${producto.id}`, { token })
    assert.ok(r.payload.some(unidad => unidad.supplier?.name === NOMBRE))
    r = await request(`/api/products/${producto.id}/kardex`, { token })
    assert.ok(r.raw.includes(NOMBRE), 'gerencia ve el nombre en el kardex')
    r = await request('/api/exports/inventory-units', { token })
    assert.ok(r.raw.includes(NOMBRE), 'gerencia ve el nombre en el CSV')
    r = await request('/api/finance', { token })
    assert.ok(r.payload.supplierPayables.rows.some(fila => fila.supplierName === NOMBRE))
    r = await request('/api/suppliers', { token })
    assert.equal(r.status, 200)
    assert.ok(r.raw.includes(NOMBRE))
    r = await request('/api/authorizations', { token })
    assert.equal(r.payload.find(fila => fila.id === `auth-sg-${marca}`).requestedValue.supplierName, NOMBRE)
  }

  // ── QR público del envío: el manifiesto no carga ni consulta el proveedor.
  const publico = readFileSync(new URL('../app/api/public/supply/shipments/[token]/route.ts', import.meta.url), 'utf8')
  const sinComentarios = publico.replace(/\/\/.*$/gm, '')
  assert.ok(!/supplier|proveedor|purchase\b/i.test(sinComentarios), 'el manifiesto público no toca el proveedor ni la compra')

  console.log('supplier-sigla-http: OK (#400)')
} finally {
  await request('/api/tenant/cost-visibility', { method: 'PUT', body: { sellerSeesCosts: false } }).catch(() => undefined)
  await db.end()
}
