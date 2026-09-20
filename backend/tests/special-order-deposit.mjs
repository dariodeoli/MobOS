// Pedido especial con seña (issue #108): ciclo real contra PostgreSQL
// descartable — tomar el pedido con anticipo y fecha esperada → verificar la
// marca persistida, el saldo y la cronología → cobrar el saldo → rechazar el
// sobrepago → cancelar con devolución de la seña. Verifica además la validación
// de la fecha esperada, el comprobante congelado y el aislamiento por empresa.
// Uso: node backend/tests/special-order-deposit.mjs BASE_URL SELLER_TOKEN ADMIN_TOKEN DATABASE_URL PG_BIN

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, sellerToken, adminToken, databaseUrl, pgBin, tenantBToken] = process.argv.slice(2)
if (!baseUrl || !sellerToken || !adminToken || !databaseUrl || !pgBin || !tenantBToken) {
  throw new Error('Uso: special-order-deposit.mjs <baseUrl> <sellerToken> <adminToken> <databaseUrl> <pgBin> <tenantBToken>')
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

const producto = expect(
  await request('/api/products', { method: 'POST', body: { sku: `IT-SPECIAL-${ts}`, name: `Producto pedido especial ${ts}`, category: 'Test', pricePyg: 400000, stock: 2, branchId: BRANCH } }),
  201,
  'alta de producto del pedido especial',
)
const cliente = expect(await request('/api/customers', { method: 'POST', body: { name: `Cliente pedido especial ${ts}` } }), 201, 'alta de cliente')

// ── Bordes de la fecha esperada ────────────────────────────────────────────
const fechaSinMarca = await request('/api/orders', { method: 'POST', token: sellerToken, body: { orderNumber: `IT-SPECIAL-BAD-${ts}`, items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 400000 }], expectedAt: '2026-11-20' } })
assert.equal(fechaSinMarca.response.status, 400, `la fecha sin marca se rechaza: ${JSON.stringify(fechaSinMarca.payload)}`)
checks++
const fechaInvalida = await request('/api/orders', { method: 'POST', token: sellerToken, body: { orderNumber: `IT-SPECIAL-BAD2-${ts}`, items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 400000 }], specialOrder: true, expectedAt: 'no-es-fecha' } })
assert.equal(fechaInvalida.response.status, 400, `una fecha inválida se rechaza: ${JSON.stringify(fechaInvalida.payload)}`)
checks++

// ── Seña: anticipo con fecha esperada, saldo pendiente ─────────────────────
const pedido = expect(
  await request('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber: `IT-SPECIAL-${ts}`,
      customerId: cliente.id,
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 400000 }],
      payment: { method: 'CASH', amountPyg: 150000 },
      specialOrder: true,
      expectedAt: '2026-11-20',
    },
  }),
  201,
  'pedido especial con seña',
)
assert.equal(pedido.isSpecialOrder, true, 'la marca de pedido especial queda guardada')
assert.ok(pedido.expectedAt, 'la fecha esperada queda guardada')
assert.equal(new Date(pedido.expectedAt).toISOString().slice(0, 10), '2026-11-20')
assert.equal(pedido.totalPyg, 400000)
assert.equal(pedido.status, 'PENDING', 'la seña no completa el pedido')
const senaConfirmada = pedido.payments.filter(p => p.status === 'CONFIRMED').reduce((sum, p) => sum + p.amountPyg, 0)
assert.equal(senaConfirmada, 150000)
checks++

// La seña queda auditada con el anticipo y la marca.
assert.equal(psql(`SELECT ("metadata"->>'isSpecialOrder') || ',' || ("metadata"->>'depositPyg') FROM "AuditLog" WHERE "action" = 'ORDER_CREATED' AND "entityId" = '${pedido.id}';`), 'true,150000')
checks++

// El comprobante congelado conserva la marca y la fecha esperada.
assert.equal(psql(`SELECT "receiptSnapshot"->'datos'->>'isSpecialOrder' FROM "Order" WHERE "id" = '${pedido.id}';`), 'true')
assert.equal(psql(`SELECT to_char(("receiptSnapshot"->'datos'->>'expectedAt')::timestamptz, 'YYYY-MM-DD') FROM "Order" WHERE "id" = '${pedido.id}';`), '2026-11-20')
checks++

// ── No se cobra de más que el saldo ────────────────────────────────────────
const sobrepago = await request('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: pedido.id, method: 'CASH', amountPyg: 250001 } })
assert.equal(sobrepago.response.status, 409, `la seña más el cobro no puede superar el total: ${JSON.stringify(sobrepago.payload)}`)
checks++

// ── Cobro del saldo: completa el pedido ────────────────────────────────────
expect(await request('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: pedido.id, method: 'TRANSFER', amountPyg: 250000 } }), 201, 'cobro del saldo')
const cerrado = expect(await request(`/api/orders/${pedido.id}`, { token: sellerToken }), 200, 'pedido tras cobrar el saldo')
assert.equal(cerrado.status, 'COMPLETED', 'al cubrir el saldo el pedido se completa')
const confirmados = cerrado.payments.filter(p => p.status === 'CONFIRMED')
assert.equal(confirmados.length, 2, 'la seña y el cobro final quedan registrados')
assert.equal(confirmados.reduce((sum, p) => sum + p.amountPyg, 0), 400000)
checks++

// La cronología muestra la seña y el cobro final.
const cronologia = expect(await request(`/api/orders/${pedido.id}/history`, { token: sellerToken }), 200, 'cronología del pedido especial')
const pagosCronologia = cronologia.events.filter(evento => evento.type === 'payment')
assert.equal(pagosCronologia.length, 2, 'la cronología lista la seña y el cobro del saldo')
checks++

// Un pedido completado no admite más cobros.
const extra = await request('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: pedido.id, method: 'CASH', amountPyg: 1000 } })
assert.equal(extra.response.status, 409, `el pedido completado no admite cobros: ${JSON.stringify(extra.payload)}`)
checks++

// ── Cancelación de la seña con su registro ─────────────────────────────────
const pedidoCancelable = expect(
  await request('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber: `IT-SPECIAL-CANCEL-${ts}`,
      customerId: cliente.id,
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 400000 }],
      payment: { method: 'CASH', amountPyg: 100000 },
      specialOrder: true,
    },
  }),
  201,
  'pedido especial a cancelar',
)
const cancelacion = expect(
  await request(`/api/orders/${pedidoCancelable.id}/return`, { method: 'POST', token: adminToken, body: { operation: 'CANCEL', reason: 'El cliente desistió del pedido especial' } }),
  200,
  'cancelación con devolución de la seña',
)
assert.equal(cancelacion.refundedPyg, 100000, 'se devuelve la seña completa')
assert.equal(cancelacion.status, 'CANCELLED')
checks++
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "orderId" = '${pedidoCancelable.id}' AND "status" = 'REFUNDED' AND "amountPyg" = 100000;`), '1', 'el reembolso de la seña queda registrado')
assert.equal(psql(`SELECT "metadata"->>'refundPyg' FROM "AuditLog" WHERE "action" = 'ORDER_CANCELLED' AND "entityId" = '${pedidoCancelable.id}';`), '100000')
checks++
const trasCancelar = await request(`/api/payments`, { method: 'POST', token: sellerToken, body: { orderId: pedidoCancelable.id, method: 'CASH', amountPyg: 1000 } })
assert.equal(trasCancelar.response.status, 409, `un pedido cancelado no admite cobros: ${JSON.stringify(trasCancelar.payload)}`)
checks++

// ── Aislamiento por empresa ────────────────────────────────────────────────
const ajeno = await request(`/api/orders/${pedido.id}`, { token: tenantBToken })
assert.equal(ajeno.response.status, 404, `la otra empresa no ve el pedido especial: ${JSON.stringify(ajeno.payload)}`)
checks++

console.log(`special-order-deposit.mjs OK (${checks} verificaciones)`)
