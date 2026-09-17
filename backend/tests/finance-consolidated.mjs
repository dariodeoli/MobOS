#!/usr/bin/env node

// Pruebas de consolidación financiera: movimientos de caja unificados entre
// /api/cash y /api/finance, payables de compras prorrateadas y rate limit de
// RUC persistido en AuthAttempt.
// Uso: node backend/tests/finance-consolidated.mjs BASE_URL ADMIN_TOKEN [DATABASE_URL] [PG_BIN] [BRANCH_ID]

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrlArg, adminToken, databaseUrl, pgBin, branchId = 'branch-a-it'] = process.argv.slice(2)

if (!baseUrlArg || !adminToken) {
  console.error('Uso: node backend/tests/finance-consolidated.mjs BASE_URL ADMIN_TOKEN [DATABASE_URL] [PG_BIN] [BRANCH_ID]')
  process.exit(2)
}

const baseUrl = baseUrlArg.replace(/\/+$/, '')
let checks = 0
const ok = (condition, label) => { if (!condition) throw new Error(label); checks++ }

async function request(path, options = {}) {
  const headers = { Authorization: 'Bearer ' + adminToken, ...(options.headers || {}) }
  const init = { ...options, headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  return fetch(baseUrl + path, init)
}

async function expectStatus(name, response, expected) {
  if (response.status !== expected) {
    const text = await response.text()
    throw new Error(name + ': esperado HTTP ' + expected + ', recibido ' + response.status + '. ' + text.slice(0, 240))
  }
}

async function json(response, name) {
  try {
    return await response.json()
  } catch {
    throw new Error(name + ': respuesta no JSON')
  }
}

const MOVEMENT_FIELDS = ['kind', 'direction', 'currency', 'originalAmount', 'exchangeRatePyg', 'amountPyg', 'counterparty', 'reference', 'description', 'status', 'accountId']

async function testIdenticalMovements() {
  const body = {
    action: 'movement',
    kind: 'EXPENSE',
    direction: 'OUT',
    currency: 'PYG',
    originalAmount: 25000,
    exchangeRatePyg: 1,
    description: 'Movimiento consolidado sintético',
    counterparty: 'Proveedor Sintético Consolidado',
    reference: 'REF-CONS-' + Date.now(),
  }
  const query = '?branchId=' + encodeURIComponent(branchId)
  const cashResponse = await request('/api/cash' + query, { method: 'POST', body })
  await expectStatus('movimiento por /api/cash', cashResponse, 201)
  const cashMovement = await json(cashResponse, 'movimiento por /api/cash')
  const financeResponse = await request('/api/finance' + query, { method: 'POST', body })
  await expectStatus('movimiento por /api/finance', financeResponse, 201)
  const financeMovement = await json(financeResponse, 'movimiento por /api/finance')
  for (const field of MOVEMENT_FIELDS) {
    ok(String(cashMovement[field]) === String(financeMovement[field]), 'movimiento: ' + field + ' idéntico entre rutas')
  }
  ok(cashMovement.id !== financeMovement.id, 'cada ruta crea su propio CashMovement')
  return MOVEMENT_FIELDS.length + 1
}

async function createProduct(sku) {
  const response = await request('/api/products', { method: 'POST', body: { sku, name: sku, pricePyg: 1, stock: 0 } })
  await expectStatus('crear producto sintético para payables', response, 201)
  return json(response, 'crear producto sintético para payables')
}

async function testPayables() {
  const stamp = Date.now()
  const productA = await createProduct('SYNTH-PAYABLE-A-' + stamp)
  const productB = await createProduct('SYNTH-PAYABLE-B-' + stamp)
  const purchaseResponse = await request('/api/purchases', {
    method: 'POST',
    body: {
      supplierName: 'Synthetic Prorate Supplier ' + stamp,
      branchId,
      shippingPyg: 3000,
      customsPyg: 0,
      insurancePyg: 700,
      taxesPyg: 0,
      otherCostsPyg: 1000,
      costAllocationMethod: 'PROPORTIONAL_VALUE',
      lines: [
        { productId: productA.id, quantity: 2, unitCostPyg: 50000 },
        { productId: productB.id, quantity: 3, unitCostPyg: 20000 },
      ],
    },
  })
  await expectStatus('crear compra con prorrateo', purchaseResponse, 201)
  const purchase = await json(purchaseResponse, 'crear compra con prorrateo')
  const linesFinalTotal = purchase.lines.reduce((total, line) => total + Number(line.finalTotalCostPyg), 0)
  const linesBaseTotal = purchase.lines.reduce((total, line) => total + Number(line.baseTotalPyg), 0)
  const grossExpenses = 3000 + 0 + 700 + 0 + 1000
  ok(linesFinalTotal === Number(purchase.finalCostPyg), 'Σ finalTotalCostPyg coincide con finalCostPyg de purchaseTotals')
  ok(linesFinalTotal === linesBaseTotal + grossExpenses, 'el prorrateo conserva el total exacto sin pérdidas')

  const receiveResponse = await request('/api/purchases', { method: 'PATCH', body: { id: purchase.id, action: 'receive' } })
  await expectStatus('recibir compra prorrateada', receiveResponse, 200)

  const query = '?branchId=' + encodeURIComponent(branchId)
  const financeResponse = await request('/api/finance' + query)
  await expectStatus('GET /api/finance para payables', financeResponse, 200)
  const finance = await json(financeResponse, 'GET /api/finance para payables')
  const payable = (finance.payables?.rows ?? []).find((row) => row.id === purchase.id)
  if (!payable) throw new Error('La compra no aparece en payables de /api/finance.')
  ok(payable.totalPyg === Number(purchase.finalCostPyg), 'payables.totalPyg usa finalTotalCostPyg prorrateado')
  ok(payable.pendingPyg === Number(purchase.finalCostPyg), 'payables.pendingPyg refleja el total sin pagos')

  const purchasesResponse = await request('/api/purchases' + query)
  await expectStatus('GET /api/purchases para comparar purchaseTotals', purchasesResponse, 200)
  const purchases = await json(purchasesResponse, 'GET /api/purchases para comparar purchaseTotals')
  const purchaseRow = purchases.find((row) => row.id === purchase.id)
  if (!purchaseRow) throw new Error('La compra no aparece en GET /api/purchases.')
  ok(Number(purchaseRow.finalCostPyg) === payable.totalPyg, 'payables es consistente con purchaseTotals() de /api/purchases')
  return 6
}

async function testRucPersistent() {
  const meResponse = await request('/api/auth/me')
  await expectStatus('obtener sesión para RUC', meResponse, 200)
  const me = await json(meResponse, 'obtener sesión para RUC')
  const accountId = me.user.tenantId + ':' + me.user.id
  const fingerprint = createHash('sha256').update('ruc:account:' + accountId).digest('hex')
  const limit = Number(process.env.RUC_ACCOUNT_HOURLY_LIMIT || 12)
  const psql = (args) => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8' })
  // La cuota se siembra directo en AuthAttempt: si el endpoint respondiera con
  // su propia memoria, estos intentos no existirían y la consulta seguiría.
  // Solo se completa lo que falta, para que una segunda corrida del script
  // demuestre la persistencia: sin re-siembra, la cuota sigue agotada.
  const fingerprintCount = () => psql(['-At', '-c', 'SELECT COUNT(*) FROM "AuthAttempt" WHERE "scope" = \'ruc:account\' AND "fingerprint" = \'' + fingerprint + '\''])
  const current = Number(fingerprintCount().trim())
  if (current < limit) {
    const ids = Array.from({ length: limit - current }, () => randomUUID())
    psql(['-c', ids.map((id) => 'INSERT INTO "AuthAttempt" ("id", "scope", "fingerprint", "createdAt") VALUES (\'' + id + '\', \'ruc:account\', \'' + fingerprint + '\', now() AT TIME ZONE \'UTC\')').join('; ')])
  }
  const first = await request('/api/ruc?ruc=80012345')
  await expectStatus('RUC con cuota agotada sembrada en DB', first, 429)
  ok(first.headers.get('retry-after') !== null, 'RUC 429 incluye Retry-After')
  const second = await request('/api/ruc?ruc=80012345')
  await expectStatus('RUC sigue en 429 en la siguiente consulta', second, 429)
  const count = Number(fingerprintCount().trim())
  ok(count === limit, 'la cuota quedó registrada en AuthAttempt (' + count + ' intentos)')
  return 4
}

async function main() {
  const movementChecks = await testIdenticalMovements()
  const payableChecks = await testPayables()
  const rucChecks = databaseUrl && pgBin ? await testRucPersistent() : 0
  console.log('finance-consolidated: ' + (movementChecks + payableChecks + rucChecks) + ' checks OK (movimientos idénticos cash/finance, payables prorrateados, RUC persistente).')
}

main().catch((error) => {
  console.error('finance-consolidated: FALLÓ - ' + (error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
