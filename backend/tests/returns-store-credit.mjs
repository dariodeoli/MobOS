// Devoluciones con reposición de stock y saldo a favor (issue #101): ciclo real
// contra PostgreSQL descartable — vender equipos serializados → devolver con
// reembolso parcial como saldo a favor → reponer stock por unidad (apto y en
// revisión) → usar el saldo en otra venta → auditoría. Verifica además la
// cancelación completa con reversión de comisión, los rechazos por montos
// inválidos, el aislamiento por empresa y la cronología del pedido.
// Uso: node backend/tests/returns-store-credit.mjs BASE_URL SELLER_TOKEN ADMIN_TOKEN DATABASE_URL PG_BIN

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, sellerToken, adminToken, databaseUrl, pgBin, tenantBToken] = process.argv.slice(2)
if (!baseUrl || !sellerToken || !adminToken || !databaseUrl || !pgBin || !tenantBToken) {
  throw new Error('Uso: returns-store-credit.mjs <baseUrl> <sellerToken> <adminToken> <databaseUrl> <pgBin> <tenantBToken>')
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

// ── Venta de dos equipos serializados ──────────────────────────────────────
const producto = expect(
  await request('/api/products', { method: 'POST', body: { sku: `IT-RET-${ts}`, name: `Producto devolución ${ts}`, category: 'Test', pricePyg: 400000, stock: 0, branchId: BRANCH } }),
  201,
  'alta de producto serializado',
)
expect(
  await request('/api/inventory-units', { method: 'POST', body: { productId: producto.id, branchId: BRANCH, serials: [`ITRETA${ts}`, `ITRETB${ts}`] } }),
  201,
  'recepción de las dos unidades',
)
const cliente = expect(await request('/api/customers', { method: 'POST', body: { name: `Cliente devolución ${ts}` } }), 201, 'alta de cliente')

const venta = expect(
  await request('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber: `IT-RET-${ts}`,
      customerId: cliente.id,
      items: [{ productId: producto.id, description: producto.name, quantity: 2, unitPricePyg: 400000, inventoryUnitSerials: [`ITRETA${ts}`, `ITRETB${ts}`] }],
      payment: { method: 'CASH', amountPyg: 500000 },
    },
  }),
  201,
  'venta con pago parcial',
)
assert.equal(venta.totalPyg, 800000)
assert.equal(venta.payments.filter(p => p.status === 'CONFIRMED').length, 1)
checks++
assert.equal(Number(expect(await request(`/api/stock?branchId=${BRANCH}`, { token: adminToken }), 200, 'stock tras vender').find(fila => fila.id === producto.id)?.stock), 0, 'vender descuenta las dos unidades')
checks++

// ── Rechazos: reembolso mayor a lo cobrado y serie ajena ──────────────────
const reembolsoExcesivo = await request(`/api/orders/${venta.id}/return`, {
  method: 'POST', token: adminToken,
  body: { operation: 'RETURN', reason: 'Prueba de tope', refundPyg: 500001, refundMode: 'CREDIT', restock: 'NONE' },
})
assert.equal(reembolsoExcesivo.response.status, 409)
checks++
const serieAjena = await request(`/api/orders/${venta.id}/return`, {
  method: 'POST', token: adminToken,
  body: { operation: 'RETURN', reason: 'Prueba de serie ajena', refundPyg: 0, restock: 'AVAILABLE', restockUnits: [{ serial: 'NO-EXISTE-EN-LA-VENTA', decision: 'AVAILABLE' }] },
})
assert.equal(serieAjena.response.status, 409, `una serie ajena se rechaza: ${JSON.stringify(serieAjena.payload)}`)
checks++

// ── Devolución parcial como saldo a favor con reposición por unidad ────────
const devolucion = expect(
  await request(`/api/orders/${venta.id}/return`, {
    method: 'POST', token: adminToken,
    body: {
      operation: 'RETURN',
      reason: 'Un equipo fallado, el otro vuelve a la venta',
      refundPyg: 200000,
      refundMode: 'CREDIT',
      restock: 'NONE',
      restockUnits: [
        { serial: `ITRETA${ts}`, decision: 'AVAILABLE' },
        { serial: `ITRETB${ts}`, decision: 'REVIEW' },
      ],
    },
  }),
  200,
  'devolución parcial con saldo a favor',
)
assert.equal(devolucion.refundedPyg, 200000)
assert.equal(devolucion.refundMode, 'CREDIT')
assert.ok(devolucion.storeCreditId, 'la devolución emite una nota de crédito')
assert.deepEqual(devolucion.restock, { available: 1, review: 1 })
assert.equal(devolucion.restockedUnits, 2)
checks++

// El pedido no se cancela con un reembolso parcial.
const ventaTrasDevolucion = expect(await request(`/api/orders/${venta.id}`, { token: sellerToken }), 200, 'pedido tras la devolución')
assert.equal(ventaTrasDevolucion.status, 'PENDING', 'la devolución parcial no cancela el pedido')
checks++

// Stock y estados de las unidades: A vuelve a la venta, B queda defectuosa.
assert.equal(Number(expect(await request(`/api/stock?branchId=${BRANCH}`, { token: adminToken }), 200, 'stock tras reponer').find(fila => fila.id === producto.id)?.stock), 1, 'solo la unidad apta vuelve al stock')
checks++
assert.equal(psql(`SELECT "status"::text FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it' AND "serial" = 'ITRETA${ts}';`), 'AVAILABLE')
assert.equal(psql(`SELECT "status"::text FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it' AND "serial" = 'ITRETB${ts}';`), 'DEFECTIVE')
checks++

// El saldo a favor queda disponible para el cliente y auditado.
const saldo = expect(await request(`/api/store-credits?customerId=${cliente.id}`, { token: sellerToken }), 200, 'saldo a favor del cliente')
assert.equal(saldo.availablePyg, 200000)
assert.equal(saldo.credits.length, 1)
assert.equal(saldo.credits[0].orderId, venta.id)
checks++
assert.equal(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'STORE_CREDIT_ISSUED' AND "entityId" = '${devolucion.storeCreditId}';`)), 1)
const auditDevolucion = psql(`SELECT ("metadata"->>'restockAvailable') || ',' || ("metadata"->>'restockReview') || ',' || ("metadata"->>'refundMode') FROM "AuditLog" WHERE "action" = 'ORDER_RETURN_RECORDED' AND "entityId" = '${venta.id}' AND "metadata"->>'refundPyg' = '200000';`)
assert.equal(auditDevolucion, '1,1,CREDIT', 'la auditoría conserva la reposición por unidad y el modo de reembolso')
checks++
// La devolución aparece en la cronología del pedido.
const cronologia = expect(await request(`/api/orders/${venta.id}/history`, { token: sellerToken }), 200, 'cronología del pedido')
assert.ok(cronologia.events.some(evento => evento.action === 'ORDER_RETURN_RECORDED'), 'la cronología muestra la devolución')
checks++

// ── Usar el saldo a favor en otra venta ────────────────────────────────────
const segundaVenta = expect(
  await request('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber: `IT-RET-USE-${ts}`,
      customerId: cliente.id,
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 400000, inventoryUnitSerials: [`ITRETA${ts}`] }],
      payment: { method: 'STORE_CREDIT', amountPyg: 200000 },
    },
  }),
  201,
  'venta pagada con saldo a favor',
)
assert.equal(segundaVenta.payments[0].method, 'STORE_CREDIT')
const saldoUsado = expect(await request(`/api/store-credits?customerId=${cliente.id}`, { token: sellerToken }), 200, 'saldo tras usarlo')
assert.equal(saldoUsado.availablePyg, 0, 'el saldo a favor se consumió')
checks++
assert.equal(Number(psql(`SELECT COUNT(*) FROM "StoreCreditUse" WHERE "orderId" = '${segundaVenta.id}' AND "amountPyg" = 200000;`)), 1)
assert.equal(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'STORE_CREDIT_USED' AND "entityId" = '${segundaVenta.id}';`)), 1)
checks++

// Sin saldo, el cobro con saldo a favor se rechaza.
const sinSaldo = await request(`/api/payments`, { method: 'POST', token: sellerToken, body: { orderId: segundaVenta.id, method: 'STORE_CREDIT', amountPyg: 10000 } })
assert.equal(sinSaldo.response.status, 409, `sin saldo a favor el cobro se rechaza: ${JSON.stringify(sinSaldo.payload)}`)
checks++

// ── Devolución total: cancela el pedido y revierte la comisión ─────────────
const total = expect(
  await request(`/api/orders/${venta.id}/return`, {
    method: 'POST', token: adminToken,
    body: { operation: 'RETURN', reason: 'Devolución total del saldo restante', restock: 'NONE' },
  }),
  200,
  'devolución total del saldo pendiente',
)
assert.equal(total.refundedPyg, 300000, 'reembolsa lo que quedaba cobrado')
assert.equal(total.status, 'CANCELLED')
assert.equal(total.commissionReverted, true)
checks++
assert.equal(psql(`SELECT "metadata"->>'commissionReverted' FROM "AuditLog" WHERE "action" = 'ORDER_RETURN_RECORDED' AND "entityId" = '${venta.id}' ORDER BY "createdAt" DESC LIMIT 1;`), 'true')
checks++

// ── Aislamiento por empresa ────────────────────────────────────────────────
const saldoAjeno = expect(await request(`/api/store-credits?customerId=${cliente.id}`, { token: tenantBToken }), 200, 'consulta de saldo desde la otra empresa')
assert.equal(saldoAjeno.availablePyg, 0, 'la otra empresa no ve el saldo ajeno')
assert.equal(saldoAjeno.credits.length, 0)
checks++

console.log(`returns-store-credit.mjs OK (${checks} verificaciones)`)
