import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #250 · #83 · Repuestos a crédito: cuenta a pagar al proveedor. La compra a
// crédito impacta con vencimiento; la de contado nace pagada; la consignación/
// depósito NO impacta hasta el consumo (y el consumo pasa a pagarse). El total
// del KPI se compara contra una agregación SQL independiente.
// Uso: PG_BIN=... node supplier-payables-http.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL>
const [base, admin, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !databaseUrl) throw new Error('base, token admin y DATABASE_URL requeridos')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const TENANT = 'tenant-a-it'
let checks = 0

async function req(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

function sql(consulta) {
  return execFileSync(`${PG_BIN}/psql`, [databaseUrl, '-At', '-t', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim()
}

// Estado limpio: las compras de prueba se borran antes y después.
sql(`DELETE FROM "SupplierPayable" WHERE "id" LIKE 'supp-q-%';`)
// Foto previa del KPI: el arnés comparte la base con otras sondas (compras del
// Centro de Abastecimiento crean sus propias cuentas), así que se comparan los
// deltas de esta sonda y no el total absoluto.
const kpiAntes = await req('/api/finance')

const vencida = '2000-01-10T00:00:00.000Z'

// ── Contado: nace pagada, no impacta en «por pagar» ─────────────────────────
const contado = await req('/api/finance', 'POST', { action: 'supplierPayable', supplierName: 'Proveedor Contado IT', concept: 'Repuestos contado', condition: 'CONTADO', amountPyg: 300000 }, 201)
assert.equal(contado.pendientePyg, 0, 'el contado no queda pendiente')
assert.equal(contado.paidPyg, 300000, 'el contado nace pagado')
assert.equal(sql(`SELECT COUNT(*) FROM "SupplierPayable" WHERE "id" = '${contado.id}' AND "paidPyg" = 300000`), '1', 'el contado quedó asentado')
checks += 2

// ── Crédito: impacta el total, con vencimiento ──────────────────────────────
const credito = await req('/api/finance', 'POST', { action: 'supplierPayable', supplierName: 'Proveedor Crédito IT', concept: 'Pantallas a crédito', condition: 'CREDITO', amountPyg: 1000000, dueAt: vencida }, 201)
assert.equal(credito.pendientePyg, 1000000, 'la compra a crédito suma al por pagar')
assert.equal(credito.vencimiento, 'VENCIDA', 'la compra a crédito vencida se marca')
// El crédito sin vencimiento se rechaza (la cuenta a pagar vive con su fecha).
await req('/api/finance', 'POST', { action: 'supplierPayable', supplierName: 'Proveedor IT', concept: 'Sin fecha', condition: 'CREDITO', amountPyg: 1000 }, 400)
// El contado/pago de un monto mayor al pendiente se rechaza.
await req('/api/finance', 'POST', { action: 'supplierPayment', id: credito.id, amountPyg: 1000001 }, 400)

// ── Consignación/depósito: sin impacto hasta el consumo ─────────────────────
const deposito = await req('/api/finance', 'POST', { action: 'supplierPayable', supplierName: 'Depósito 2 IT', concept: 'Baterías en depósito', condition: 'CONSIGNACION', amountPyg: 800000 }, 201)
assert.equal(deposito.pendientePyg, 0, 'la consignación no impacta sin consumo')
assert.equal(deposito.depositoPyg, 800000, 'la tenencia del proveedor se informa aparte')

const consumido = await req('/api/finance', 'POST', { action: 'supplierConsumption', id: deposito.id, amountPyg: 300000 })
assert.equal(consumido.pendientePyg, 300000, 'lo consumido pasa a pagarse')
assert.equal(consumido.depositoPyg, 500000, 'el resto sigue en depósito')
await req('/api/finance', 'POST', { action: 'supplierConsumption', id: deposito.id, amountPyg: 900000 }, 400)

// ── Pago: baja el pendiente ────────────────────────────────────────────────
const pagado = await req('/api/finance', 'POST', { action: 'supplierPayment', id: credito.id, amountPyg: 250000 })
assert.equal(pagado.pendientePyg, 750000, 'el pago baja el pendiente')

// ── KPI de /api/finance: totales y tenencia ────────────────────────────────
const finance = await req('/api/finance')
const mio = finance.supplierPayables.rows.filter(fila => fila.id === credito.id || fila.id === deposito.id)
assert.equal(mio.length, 2, 'las dos compras vivas aparecen en la lista')
assert.equal(finance.supplierPayables.totalPyg - kpiAntes.supplierPayables.totalPyg, 1050000, 'por pagar = crédito pendiente + consumo')
assert.equal(finance.supplierPayables.vencidasPyg - kpiAntes.supplierPayables.vencidasPyg, 750000, 'el crédito vencido se cuenta aparte')
assert.equal(finance.supplierPayables.depositoPyg - kpiAntes.supplierPayables.depositoPyg, 500000, 'la tenencia no impacta el por pagar')

// Agregación SQL independiente: el total no depende de la lista.
const esperado = sql(`SELECT COALESCE(SUM(CASE WHEN sp."condition" = 'CREDITO' THEN GREATEST(0, sp."amountPyg" - sp."paidPyg") WHEN sp."condition" = 'CONSIGNACION' THEN GREATEST(0, LEAST(sp."consumedPyg", sp."amountPyg") - sp."paidPyg") ELSE 0 END), 0) FROM "SupplierPayable" sp WHERE sp."tenantId" = '${TENANT}'`)
assert.equal(String(finance.supplierPayables.totalPyg), esperado, 'el KPI coincide con la base')
checks += 1

// ── Limpieza ────────────────────────────────────────────────────────────────
sql(`DELETE FROM "SupplierPayable" WHERE "id" LIKE 'supp-%';`)
assert.equal(sql(`SELECT COUNT(*) FROM "SupplierPayable" WHERE "id" LIKE 'supp-%'`), '0', 'quedó limpio')
checks += 1

console.log(`PASS: repuestos a crédito · contado sin impacto · crédito 1.000.000 con vencimiento · consignación 800.000 (300.000 consumidos) · ${checks} chequeos`)
