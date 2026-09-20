// Ventas suspendidas recuperables (issue #107): ciclo real contra PostgreSQL
// descartable — suspender un carrito armado, listarlo por sucursal, retomarlo
// con la lista de precios vigente y cobrarlo. Verifica además que una
// suspendida no toca stock, caja ni reportes, el aislamiento por empresa, el
// tope por sucursal y la limpieza de las vencidas.
// Uso: node backend/tests/suspended-sales.mjs BASE_URL SELLER_TOKEN ADMIN_TOKEN SELLER_TOKEN_B DATABASE_URL PG_BIN

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, sellerToken, adminToken, sellerTokenB, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !sellerToken || !adminToken || !sellerTokenB || !databaseUrl || !pgBin) {
  throw new Error('Uso: suspended-sales.mjs <baseUrl> <sellerToken> <adminToken> <sellerTokenB> <databaseUrl> <pgBin>')
}

const BRANCH = 'branch-a-it'
let checks = 0

async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const expect = (result, status, label) => {
  assert.equal(result.response.status, status, `${label}: HTTP ${result.response.status} ${JSON.stringify(result.payload)}`)
  checks++
  return result.payload
}

const psql = (sql) => execFileSync(join(pgBin, 'psql'), [databaseUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const ts = Date.now()

// Producto propio del arnés (stock y reportes no se mezclan con otras pruebas).
const producto = expect(
  await request('/api/products', { method: 'POST', body: { sku: `IT-SUSP-${ts}`, name: `Producto suspendido ${ts}`, category: 'Test', pricePyg: 100000, stock: 5, branchId: BRANCH } }),
  201,
  'alta de producto del arnés',
)
const stockInicial = Number(expect(await request(`/api/stock?branchId=${BRANCH}`, { token: adminToken }), 200, 'stock inicial').find((fila) => fila.id === producto.id)?.stock)
assert.equal(stockInicial, 5)
checks++

// ── Suspender un carrito armado (cliente + 2 ítems + descuento) ─────────────
const cliente = expect(
  await request('/api/customers', { method: 'POST', body: { name: `Cliente suspendido ${ts}` } }),
  201,
  'alta de cliente del arnés',
)
const payload = {
  items: [{ key: 'k1', productoId: producto.id, nombre: producto.name, precio: 100000, quantity: 2, serials: [] }],
  customer: { name: cliente.name, phone: '', countryCode: '+595', email: '', document: '', addresses: [] },
  descuento: '50000',
  pagos: [],
  entrega: 'RETIRO',
}
const suspendida = expect(
  await request('/api/suspended-sales', { method: 'POST', token: sellerToken, body: { branchId: BRANCH, customerId: cliente.id, label: 'Carrito de prueba', payload } }),
  201,
  'suspensión del carrito',
)
assert.ok(suspendida.id)
checks++

// La suspendida identifica cliente, total, quién y cuándo sin tocar stock.
const listado = expect(await request(`/api/suspended-sales?branchId=${BRANCH}`, { token: sellerToken }), 200, 'listado de suspendidas')
const fila = listado.find((item) => item.id === suspendida.id)
assert.ok(fila, 'la suspendida aparece en el listado de la sucursal')
assert.equal(fila.totalPyg, 150000, 'el total es líneas menos descuento')
assert.equal(fila.customer?.name, cliente.name)
assert.equal(fila.user?.name, 'Seller A')
assert.ok(fila.createdAt, 'la suspendida informa cuándo se guardó')
assert.equal(fila.label, 'Carrito de prueba')
checks++

// No impacta stock, ventas ni reportes hasta cobrarla.
const stockTrasSuspender = Number(expect(await request(`/api/stock?branchId=${BRANCH}`, { token: adminToken }), 200, 'stock tras suspender').find((item) => item.id === producto.id)?.stock)
assert.equal(stockTrasSuspender, 5, 'suspender no descuenta stock')
const hoy = new Date().toISOString().slice(0, 10)
const reporteAntes = expect(await request(`/api/reports?from=${hoy}&to=${hoy}&groupBy=product`, { token: adminToken }), 200, 'reporte tras suspender')
const grupoAntes = (reporteAntes.groups || []).find((grupo) => grupo.label === producto.name)
assert.equal(Number(grupoAntes?.units || 0), 0, 'suspender no suma unidades al reporte')
const auditSuspension = Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'SALE_SUSPENDED' AND "entityId" = '${suspendida.id}';`))
assert.equal(auditSuspension, 1, 'la suspensión queda auditada')
checks++

// ── Retomar: el precio vigente manda sobre el guardado ─────────────────────
expect(await request('/api/products', { method: 'PATCH', body: { id: producto.id, pricePyg: 150000 } }), 200, 'cambio de precio del producto')
const vigente = expect(await request(`/api/pricing?productId=${producto.id}&quantity=2`, { token: sellerToken }), 200, 'precio vigente al retomar')
assert.equal(vigente.unitPricePyg, 150000, 'el servidor resuelve la lista vigente al retomar')
assert.notEqual(vigente.unitPricePyg, payload.items[0].precio, 'el precio guardado ya no es el vigente')
checks++

// Cobrar el carrito retomado: recién acá nacen la venta, el pago y el stock.
const venta = expect(
  await request('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber: `IT-SUSP-${ts}`,
      customerId: cliente.id,
      items: [{ productId: producto.id, description: producto.name, quantity: 2, unitPricePyg: vigente.unitPricePyg }],
      payment: { method: 'CASH', amountPyg: 300000 },
    },
  }),
  201,
  'cobro del carrito retomado',
)
assert.equal(venta.totalPyg, 300000)
const stockTrasCobrar = Number(expect(await request(`/api/stock?branchId=${BRANCH}`, { token: adminToken }), 200, 'stock tras cobrar').find((item) => item.id === producto.id)?.stock)
assert.equal(stockTrasCobrar, 3, 'cobrar el carrito sí descuenta stock')
checks++

// ── Descartar la suspendida retomada deja el listado limpio ────────────────
expect(await request(`/api/suspended-sales?id=${suspendida.id}`, { method: 'DELETE', token: sellerToken }), 200, 'descarte de la suspendida')
const listadoFinal = expect(await request(`/api/suspended-sales?branchId=${BRANCH}`, { token: sellerToken }), 200, 'listado final')
assert.ok(!listadoFinal.some((item) => item.id === suspendida.id), 'la recuperada ya no está en la lista')
checks++

// ── Aislamiento por empresa ────────────────────────────────────────────────
const listadoB = expect(await request(`/api/suspended-sales?branchId=branch-b-it`, { token: sellerTokenB, tenant: 'tenant-b-it' }), 200, 'listado de la empresa B')
assert.ok(!listadoB.some((item) => item.id === suspendida.id), 'la otra empresa no ve la suspendida')
checks++

// ── Limpieza de vencidas y tope por sucursal ───────────────────────────────
psql(`INSERT INTO "SuspendedSale" ("id", "tenantId", "branchId", "userId", "label", "payload", "createdAt", "updatedAt") VALUES ('suspendida-vencida-it', 'tenant-a-it', '${BRANCH}', 'user-a-it', 'Vencida', '{"items":[]}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '8 days', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;`)
const trasLimpieza = expect(await request(`/api/suspended-sales?branchId=${BRANCH}`, { token: sellerToken }), 200, 'listado con limpieza de vencidas')
assert.ok(!trasLimpieza.some((item) => item.id === 'suspendida-vencida-it'), 'la vencida se limpia al listar')
const auditVencida = Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'SALE_SUSPENDED_EXPIRED' AND "entityId" = 'suspendida-vencida-it';`))
assert.equal(auditVencida, 1, 'la limpieza de vencidas queda auditada')
checks++

psql(`INSERT INTO "SuspendedSale" ("id", "tenantId", "branchId", "userId", "label", "payload", "createdAt", "updatedAt") SELECT 'suspendida-tope-' || n, 'tenant-a-it', '${BRANCH}', 'user-a-it', 'Tope ' || n, '{"items":[]}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM generate_series(1, 50) AS n ON CONFLICT ("id") DO NOTHING;`)
const lleno = await request('/api/suspended-sales', { method: 'POST', token: sellerToken, body: { branchId: BRANCH, payload } })
assert.equal(lleno.response.status, 409, `el tope por sucursal corta con 409: ${JSON.stringify(lleno.payload)}`)
assert.match(String(lleno.payload?.message || lleno.payload?.error || ''), /50 ventas suspendidas/)
checks++
psql(`DELETE FROM "SuspendedSale" WHERE "id" LIKE 'suspendida-tope-%';`)

console.log(`suspended-sales.mjs OK (${checks} verificaciones)`)
