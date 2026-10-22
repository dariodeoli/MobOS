#!/usr/bin/env node

// Venta a crédito con límite y tolerancia del módulo, plazo (días, día del mes,
// cuotas) y autorización de días de crédito, sobre HTTP real. Corre al final del
// arnés porque crea varios pedidos (backup-restore cuenta los de la empresa).
//
// Uso: credito-tolerancia.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <databaseUrl>

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, gerenteToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !gerenteToken || !databaseUrl) throw new Error('Uso: credito-tolerancia.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <databaseUrl>')

const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()
const stamp = Date.now().toString(36)

async function call(path, { method = 'GET', token = adminToken, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.79', 'x-tenant-id': 'tenant-a-it', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const settingsOriginal = psql(`SELECT COALESCE("settings", '{}'::jsonb)::text FROM "Tenant" WHERE "id" = 'tenant-a-it'`)
const configModulo = (cuotas) => psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings", '{}'::jsonb) || '${JSON.stringify({ moduleConfig: { cuotas } })}'::jsonb WHERE "id" = 'tenant-a-it'`)

try {
  let r = await call('/api/products', { method: 'POST', body: { sku: `CRED-TOL-${stamp}`, name: 'Equipo tolerancia', pricePyg: 10000, stock: 80, branchId: 'branch-a-it' } })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const product = r.payload
  const venta = (customerId, price, extra = {}, token = sellerToken) => call('/api/orders', { method: 'POST', token, body: { customerId, items: [{ productId: product.id, description: product.name, quantity: 1, unitPricePyg: price }], payments: [], ...extra } })
  const nuevoCliente = async (nombre, extra = {}) => {
    const alta = await call('/api/customers', { method: 'POST', body: { name: `${nombre} ${stamp}`, phone: `5959${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, ...extra } })
    assert.equal(alta.status, 201, JSON.stringify(alta.payload))
    return alta.payload
  }

  // ── Límite y tolerancia del módulo ──────────────────────────────────────────
  configModulo({ defaultLimitPyg: 5000000, tolerancePct: 10, plazo: { mode: 'DIAS', days: 15, dayOfMonth: 5, installments: 3, intervalDays: 30, maxDays: 60 } })
  // Cliente sin límite propio: rige el del módulo (5.000.000) con su tolerancia (10 %).
  const delModulo = await nuevoCliente('Límite del módulo')
  r = await venta(delModulo.id, 5500000, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null, '5.500.000 entra por la tolerancia del módulo')
  assert.equal(r.payload.creditDays, 15, 'el plazo por defecto del módulo')
  assert.equal(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'CREDIT_TOLERANCE_USED' AND "entityId" = '${r.payload.id}'`)), 1, 'el uso de la tolerancia queda auditado')
  const pasadoModulo = await nuevoCliente('Pasa el tope')
  r = await venta(pasadoModulo.id, 5500001, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'un peso sobre el tope pide autorización')
  assert.equal(r.payload.creditAuthorization?.overPyg, 1)
  // Ficha con límite propio: la tolerancia es la suya si la tiene, si no la del módulo.
  const propioSinTol = await nuevoCliente('Límite propio', { creditLimitPyg: 1000000 })
  r = await venta(propioSinTol.id, 1100000, { credit: true })
  assert.equal(r.payload.creditAuthorization, null, 'sin tolerancia propia vale la del módulo')
  const propioConCero = await nuevoCliente('Sin tolerancia', { creditLimitPyg: 1000000, creditTolerancePct: 0 })
  r = await venta(propioConCero.id, 1000001, { credit: true })
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'tolerancia 0 de la ficha: manda el límite a secas')

  // ── Entregar con saldo a un cliente SIN límite propio: rige el límite y el plazo del módulo ──
  const productoEntrega = (await call('/api/products', { method: 'POST', body: { sku: `CRED-ENT-${stamp}`, name: 'Equipo entrega módulo', pricePyg: 1000000, stock: 30, branchId: 'branch-a-it' } })).payload
  const pedidoConSaldo = async (customerId) => {
    const creado = await call('/api/orders', { method: 'POST', token: sellerToken, body: { customerId, items: [{ productId: productoEntrega.id, quantity: 1, unitPricePyg: 1000000 }], payments: [{ method: 'CASH', amountPyg: 400000 }] } })
    assert.equal(creado.status, 201, JSON.stringify(creado.payload))
    return creado.payload
  }
  const clienteEntrega = await nuevoCliente('Entrega con módulo')
  configModulo({ defaultLimitPyg: 3000000, tolerancePct: 0, plazo: { mode: 'DIAS', days: 20, maxDays: 365 } })
  const entregable = await pedidoConSaldo(clienteEntrega.id)
  r = await call(`/api/orders/${entregable.id}`, { method: 'PATCH', token: sellerToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(Number(r.payload.creditDays), 20, 'sin plazo propio rige el del módulo')
  assert.ok(r.payload.dueAt, 'y deja el vencimiento calculado por el servidor')
  configModulo({ defaultLimitPyg: 100000, tolerancePct: 0, plazo: { mode: 'DIAS', days: 20, maxDays: 365 } })
  const sobreLimite = await pedidoConSaldo(clienteEntrega.id)
  r = await call(`/api/orders/${sobreLimite.id}`, { method: 'PATCH', token: sellerToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 409, 'el límite del módulo también frena la entrega con saldo')
  // Con selfApproveRoles = [] ni el administrador aprueba su propia venta a crédito.
  psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"paymentVerification":{"methods":{},"selfApproveRoles":[]}}'::jsonb WHERE "id" = 'tenant-a-it'`)
  const propia = await nuevoCliente('Admin propio', { creditLimitPyg: 100000, creditDays: 7 })
  r = await venta(propia.id, 600000, { creditDays: 7 }, adminToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  r = await call(`/api/orders/${r.payload.id}/credit-authorization`, { method: 'POST', token: adminToken, body: { action: 'approve' } })
  assert.equal(r.status, 403, 'el administrador no aprueba su propia venta a crédito sin configuración')

  configModulo({ defaultLimitPyg: 5000000, tolerancePct: 10, plazo: { mode: 'DIAS', days: 15, dayOfMonth: 5, installments: 3, intervalDays: 30, maxDays: 60 } })
  // ── Plazo ───────────────────────────────────────────────────────────────────
  // Más allá del máximo del módulo pide autorización de días (administración y gerencia pueden solas).
  const largo = await nuevoCliente('Plazo largo', { creditLimitPyg: 100000000 })
  r = await venta(largo.id, 100000, { creditDays: 61 })
  assert.equal(r.status, 403, 'el vendedor no pasa el máximo de días')
  r = await venta(largo.id, 100000, { creditDays: 61 }, gerenteToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditDays, 61)
  // Autorización de días: la consume una venta, una sola vez, y alcanza solo para los días autorizados.
  const clienteDias = await nuevoCliente('Días de crédito', { creditLimitPyg: 100000000 })
  const pedido = await call('/api/authorizations', { method: 'POST', token: sellerToken, body: { customerId: clienteDias.id, kind: 'CREDIT_DAYS', requestedValue: { creditDays: 90 } } })
  assert.equal(pedido.status, 201, JSON.stringify(pedido.payload))
  r = await call('/api/authorizations', { method: 'PATCH', body: { id: pedido.payload.id, action: 'approve', resolvedValue: { creditDays: 90 } } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  r = await venta(clienteDias.id, 100000, { creditDays: 120, creditDaysAuthorizationId: pedido.payload.id })
  assert.equal(r.status, 403, 'la autorización de 90 días no alcanza para 120')
  r = await venta(clienteDias.id, 100000, { creditDays: 90, creditDaysAuthorizationId: pedido.payload.id })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(Number(r.payload.creditDays), 90)
  r = await venta(clienteDias.id, 100000, { creditDays: 90, creditDaysAuthorizationId: pedido.payload.id })
  assert.equal(r.status, 403, 'la autorización de días se usa una sola vez')

  // Día del mes.
  configModulo({ defaultLimitPyg: 5000000, tolerancePct: 10, plazo: { mode: 'DIA_MES', dayOfMonth: 5, maxDays: 365 } })
  r = await venta(largo.id, 100000, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT to_char("dueAt" - interval '3 hours', 'DD') FROM "Order" WHERE "id" = '${r.payload.id}'`), '05', 'vence el día 5 del mes')

  // Cuotas desde la ficha: pagos CREDIT con vencimiento que suman el saldo.
  const encuotas = await nuevoCliente('En cuotas', { creditLimitPyg: 100000000, creditTermMode: 'CUOTAS', creditInstallments: 3 })
  r = await venta(encuotas.id, 1000001, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const detalle = await call(`/api/orders/${r.payload.id}`)
  const plan = detalle.payload.payments.filter((p) => p.method === 'CREDIT').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  assert.deepEqual(plan.map((p) => Number(p.amountPyg)), [333333, 333333, 333335])
  assert.ok(plan.every((p) => p.status === 'PENDING' && p.pendingReason === 'CUOTA' && p.dueAt))
  assert.equal(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${r.payload.id}' AND status = 'CONFIRMED'`), '0', 'las cuotas pendientes no suman como cobradas')

  // La ficha valida sus campos de plazo y tolerancia.
  r = await call(`/api/customers/${encuotas.id}`, { method: 'PATCH', body: { creditTolerancePct: 15 } })
  assert.equal(r.status, 400, JSON.stringify(r.payload))
  r = await call(`/api/customers/${encuotas.id}`, { method: 'PATCH', body: { creditTolerancePct: 20, creditTermMode: 'DIAS' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT "creditTolerancePct" FROM "Customer" WHERE "id" = '${encuotas.id}'`), '20')

  console.log('credito-tolerancia: OK')
} finally {
  psql(`UPDATE "Tenant" SET "settings" = '${settingsOriginal.replace(/'/g, "''")}'::jsonb WHERE "id" = 'tenant-a-it'`)
}
