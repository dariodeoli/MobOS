import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #83/#148 · Los KPI de /api/finance (por cobrar, por pagar y margen real) se
// calculan sobre TODO el historial: las listas se cortan en 5.000 filas y sus
// totales no pueden depender de ese tope (misma regla que créditos). El test
// mide la API antes, siembra 5.100 ventas con costo y 5.100 compras, y compara
// el **delta** exacto de cada KPI (no depende de los datos que ya tenga la base).
// Uso: PG_BIN=... node finance-totales.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL>
const [base, admin, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !databaseUrl) throw new Error('base, token admin y DATABASE_URL requeridos')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const TENANT = 'tenant-a-it'
const RAMA = 'branch-a-it'
const VENTAS = 5100
const COMPRAS = 5100
const PRECIO = 100000
const COSTO = 60000
const COMPRA = 50000
let checks = 0

async function req(path) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${admin}` } })
  const data = await response.json()
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(data).slice(0, 200)}`)
  checks++
  return data
}

function sql(consulta) {
  return execFileSync(`${PG_BIN}/psql`, [databaseUrl, '-At', '-t', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim()
}

const limpiar = () => sql(`DELETE FROM "OrderItem" WHERE "orderId" LIKE 'fin-tot-ord-%'; DELETE FROM "Order" WHERE "id" LIKE 'fin-tot-ord-%'; DELETE FROM "PurchaseLine" WHERE "purchaseId" LIKE 'fin-tot-po-%'; DELETE FROM "PurchaseOrder" WHERE "id" LIKE 'fin-tot-po-%';`)
limpiar()
const antes = await req('/api/finance')

// Ventas pendientes con costo (una línea cada una) y compras por pagar.
sql(`INSERT INTO "Order" ("id", "tenantId", "branchId", "sellerId", "orderNumber", "status", "subtotalPyg", "discountPyg", "deliveryPyg", "totalPyg", "createdAt", "updatedAt")
  SELECT 'fin-tot-ord-' || g, '${TENANT}', '${RAMA}', 'user-admin-it', 'FINT-' || g, 'PENDING', ${PRECIO}, 0, 0, ${PRECIO}, now(), now() FROM generate_series(1, ${VENTAS}) g;`)
sql(`INSERT INTO "OrderItem" ("id", "orderId", "description", "quantity", "unitPricePyg", "unitCostPyg", "totalPyg")
  SELECT 'fin-tot-item-' || g, 'fin-tot-ord-' || g, 'Ítem QA financiero', 1, ${PRECIO}, ${COSTO}, ${PRECIO} FROM generate_series(1, ${VENTAS}) g;`)
sql(`INSERT INTO "PurchaseOrder" ("id", "tenantId", "branchId", "supplierName", "status", "createdById")
  SELECT 'fin-tot-po-' || g, '${TENANT}', '${RAMA}', 'Proveedor QA financiero', 'DRAFT', 'user-admin-it' FROM generate_series(1, ${COMPRAS}) g;`)
sql(`INSERT INTO "PurchaseLine" ("id", "purchaseId", "productId", "quantity", "unitCostPyg", "baseTotalPyg", "finalTotalCostPyg", "finalUnitCostPyg")
  SELECT 'fin-tot-pl-' || g, 'fin-tot-po-' || g, (SELECT "id" FROM "Product" WHERE "tenantId" = '${TENANT}' LIMIT 1), 1, ${COMPRA}, ${COMPRA}, ${COMPRA}, ${COMPRA} FROM generate_series(1, ${COMPRAS}) g;`)
assert.equal(sql(`SELECT COUNT(*) FROM "Order" WHERE "id" LIKE 'fin-tot-ord-%'`), String(VENTAS), 'quedaron las ventas sembradas')
assert.equal(sql(`SELECT COUNT(*) FROM "PurchaseOrder" WHERE "id" LIKE 'fin-tot-po-%'`), String(COMPRAS), 'quedaron las compras sembradas')
checks += 2

const despues = await req('/api/finance')

// Delta exacto por KPI: no depende de lo que ya tuviera la base.
assert.equal(despues.receivables.totalPyg - antes.receivables.totalPyg, VENTAS * PRECIO, 'Por cobrar incluye las 5.100 ventas nuevas')
assert.equal(despues.receivables.orders - antes.receivables.orders, VENTAS, 'y las cuenta a todas')
assert.equal(despues.payables.totalPyg - antes.payables.totalPyg, COMPRAS * COMPRA, 'Por pagar incluye las 5.100 compras nuevas')
assert.equal(despues.payables.purchases - antes.payables.purchases, COMPRAS, 'y las cuenta a todas')
assert.equal(despues.margin.profitPyg - antes.margin.profitPyg, VENTAS * (PRECIO - COSTO), 'el margen real incluye las ventas nuevas')
checks += 5

// Las listas siguen acotadas (ventana de pantalla): muestran menos de lo que
// cuentan los totales, que son los completos.
assert.ok(despues.receivables.rows.length <= 5000, 'la lista de por cobrar no supera las 5.000 filas')
assert.ok(despues.receivables.rows.length < despues.receivables.orders, 'la lista de por cobrar es parcial; el total es completo')
assert.ok(despues.payables.rows.length <= 5000, 'la lista de por pagar no supera las 5.000 filas')
assert.ok(despues.payables.rows.length < despues.payables.purchases, 'la lista de por pagar es parcial; el total es completo')
checks += 4

console.log(`PASS: KPI de finanzas sin totales truncados — +${VENTAS} ventas (por cobrar +${VENTAS * PRECIO}, margen +${VENTAS * (PRECIO - COSTO)}) y +${COMPRAS} compras (por pagar +${COMPRAS * COMPRA}); listas cortadas en 5.000 · ${checks} chequeos`)

limpiar()
