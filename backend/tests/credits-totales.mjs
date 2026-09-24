import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #83/#148 · Control de créditos: la lista se corta en los 200 clientes más
// morosos, pero los totales de la pantalla se calculan sobre TODOS los deudores
// (antes salían de las 200 filas y quedaban cortos en silencio). El test siembra
// 205 deudores con una orden vencida y compara los totales de la API contra una
// agregación SQL independiente.
// Uso: PG_BIN=... node credits-totales.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL>
const [base, admin, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !databaseUrl) throw new Error('base, token admin y DATABASE_URL requeridos')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const TENANT = 'tenant-a-it'
const RAMA = 'branch-a-it'
const SEMBRADOS = 205
const MONTO = 100000
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

// 205 deudores propios: orden pendiente, sin pagos, vencida hace 2 días.
sql(`DELETE FROM "Order" WHERE "id" LIKE 'cred-ord-%'; DELETE FROM "Customer" WHERE "id" LIKE 'cred-cli-%';`)
sql(`INSERT INTO "Customer" ("id", "tenantId", "name", "updatedAt") SELECT 'cred-cli-' || g, '${TENANT}', 'Deudor QA ' || g, now() FROM generate_series(1, ${SEMBRADOS}) g;`)
sql(`INSERT INTO "Order" ("id", "tenantId", "branchId", "customerId", "sellerId", "orderNumber", "status", "subtotalPyg", "discountPyg", "deliveryPyg", "totalPyg", "dueAt", "createdAt", "updatedAt") SELECT 'cred-ord-' || g, '${TENANT}', '${RAMA}', 'cred-cli-' || g, 'user-admin-it', 'CRED-' || g, 'PENDING', ${MONTO}, 0, 0, ${MONTO}, now() - interval '2 days', now(), now() FROM generate_series(1, ${SEMBRADOS}) g;`)
assert.equal(sql(`SELECT COUNT(*) FROM "Order" WHERE "id" LIKE 'cred-ord-%'`), String(SEMBRADOS), 'quedaron los deudores sembrados')
checks += 1

const creditos = await req('/api/credits')
assert.equal(creditos.truncado, true, 'la lista avisa que se cortó')
assert.equal(creditos.credits.length, 200, 'la lista llega al tope de 200')
checks += 2

// Expectativa independiente (sin repetir la consulta por cliente de la API).
const [porCobrar, enMora, conDeuda, enMoraClientes] = sql(`SELECT
    COALESCE(SUM(o."totalPyg" - COALESCE(p.confirmed, 0)), 0),
    COALESCE(SUM(CASE WHEN o."dueAt" < now() THEN o."totalPyg" - COALESCE(p.confirmed, 0) ELSE 0 END), 0),
    COUNT(DISTINCT o."customerId"),
    COUNT(DISTINCT o."customerId") FILTER (WHERE o."dueAt" < now())
  FROM "Order" o
  LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = '${TENANT}' AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
  WHERE o."tenantId" = '${TENANT}' AND o.status = 'PENDING' AND o."customerId" IS NOT NULL AND o."branchId" = '${RAMA}'`).split('|').map(Number)

assert.equal(creditos.totals.outstandingPyg, porCobrar, `el total por cobrar incluye a todos los deudores (${porCobrar})`)
assert.equal(creditos.totals.overduePyg, enMora, `el total en mora también (${enMora})`)
assert.equal(creditos.totals.customersWithDebt, conDeuda, 'los clientes con deuda son todos')
assert.equal(creditos.totals.overdueCustomers, enMoraClientes, 'y los clientes en mora también')
assert.ok(creditos.totals.overduePyg >= SEMBRADOS * MONTO, `los ${SEMBRADOS} sembrados están en mora (${SEMBRADOS * MONTO})`)
checks += 5

console.log(`PASS: créditos sin totales truncados — lista 200 con aviso, totales sobre ${conDeuda} deudores (por cobrar ${porCobrar} · en mora ${enMora}) · ${checks} chequeos`)

// Limpieza: los deudores sembrados no participan de nada más del arnés.
sql(`DELETE FROM "Order" WHERE "id" LIKE 'cred-ord-%'; DELETE FROM "Customer" WHERE "id" LIKE 'cred-cli-%';`)
