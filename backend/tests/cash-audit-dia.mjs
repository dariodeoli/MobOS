import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #148 §17 — El día operativo de la auditoría de caja es Paraguay (UTC-3, mismo
// criterio que el resto de Finanzas). El test fija un cobro en efectivo a las
// 03:30Z de hoy (00:30 en Paraguay) y compara la auditoría contra el cálculo
// independiente en SQL: con el -04 heredado la ventana empezaba a las 04:00Z y
// ese cobro caía en la auditoría del día anterior.
// Uso: PG_BIN=... node cash-audit-dia.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL>
const [base, admin, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !databaseUrl) throw new Error('base, token admin y DATABASE_URL requeridos')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const TENANT = 'tenant-a-it'
const rama = 'branch-a-it'
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

const inicioParaguay = (clave) => {
  const [y, m, d] = clave.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + 3 * 3600000).toISOString()
}
const diaParaguay = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10)
const hoy = diaParaguay(Date.now())
const ayer = diaParaguay(Date.parse(`${hoy}T12:00:00.000Z`) - 86400000)
const sufijo = Date.now().toString(36).toUpperCase()
const monto = 250000 + (Date.now() % 1000)

// Cobro en efectivo con referencia propia para ubicarlo en la base.
const producto = await req('/api/products', 'POST', { name: `Cobro auditoría ${sufijo}`, sku: `AUDB-${sufijo}`, pricePyg: monto, stock: 1 }, 201)
const orden = await req('/api/orders', 'POST', {
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto }],
  payments: [{ method: 'CASH', amountPyg: monto, status: 'CONFIRMED', reference: `AUD-${sufijo}` }],
}, 201)
const pagoId = sql(`SELECT "id" FROM "Payment" WHERE "reference" = 'AUD-${sufijo}'`)
assert.ok(pagoId, 'el cobro quedó registrado')

// 00:30 en Paraguay: con -04 quedaba fuera de «hoy» (ventana desde 04:00Z).
sql(`UPDATE "Payment" SET "paidAt" = '${hoy}T03:30:00.000Z' WHERE "id" = '${pagoId}';`)
assert.equal(sql(`SELECT COUNT(*) FROM "Payment" WHERE "id" = '${pagoId}' AND "paidAt" = '${hoy}T03:30:00.000Z'`), '1', 'el cobro quedó a las 00:30 de Paraguay')

// Expectativa independiente: misma semántica de día paraguayo (-03).
function esperadoDe(dia) {
  const desde = inicioParaguay(dia)
  const hasta = new Date(Date.parse(desde) + 86400000).toISOString()
  const [confirmado, cantidad, reembolsado] = sql(`SELECT
    COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0),
    COUNT(*) FILTER (WHERE p."status" = 'CONFIRMED'),
    COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'REFUNDED'), 0)
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" AND o."tenantId" = p."tenantId"
    WHERE p."tenantId" = '${TENANT}' AND o."branchId" = '${rama}' AND p."method" = 'CASH'
      AND p."paidAt" >= '${desde}' AND p."paidAt" < '${hasta}'`).split('|').map(Number)
  return { confirmado, cantidad, reembolsado, desde, hasta }
}

const auditoriaHoy = await req(`/api/cash/audit?branchId=${rama}&date=${hoy}`)
const cajaHoy = auditoriaHoy.methods.find((fila) => fila.method === 'CASH')
const esperadoHoy = esperadoDe(hoy)
assert.equal(auditoriaHoy.window.offset, '-03:00', 'la auditoría delimita el día en UTC-3')
assert.equal(cajaHoy.amountPyg, esperadoHoy.confirmado, `el efectivo de hoy incluye el cobro de las 00:30 (${esperadoHoy.confirmado})`)
assert.equal(cajaHoy.count, esperadoHoy.cantidad, 'y su cantidad')
assert.ok(cajaHoy.amountPyg >= monto, `el cobro propio está en hoy (${monto})`)

const auditoriaAyer = await req(`/api/cash/audit?branchId=${rama}&date=${ayer}`)
const cajaAyer = auditoriaAyer.methods.find((fila) => fila.method === 'CASH')
const esperadoAyer = esperadoDe(ayer)
assert.equal(cajaAyer.amountPyg, esperadoAyer.confirmado, 'el efectivo de ayer no cambia')

// La lista de operaciones del día también lo incluye (mismo día operativo).
const operacionesHoy = await req(`/api/cash/audit-operations?branchId=${rama}&from=${hoy}&to=${hoy}`)
const enHoy = operacionesHoy.operaciones.some((fila) => fila.id === pagoId)
assert.ok(enHoy, 'la operación aparece en la auditoría de hoy')
const operacionesAyer = await req(`/api/cash/audit-operations?branchId=${rama}&from=${ayer}&to=${ayer}`)
const enAyer = operacionesAyer.operaciones.some((fila) => fila.id === pagoId)
assert.ok(!enAyer, 'y no en la de ayer')

// Reembolso parcial en efectivo: sale de la caja y se informa como reembolsado.
const reembolso = 100000
await req(`/api/orders/${orden.id}/return`, 'POST', { operation: 'RETURN', reason: 'Reembolso de prueba de auditoría', refundPyg: reembolso, refundMode: 'CASH', restock: 'NONE' }, 200)
const reembolsoId = sql(`SELECT "id" FROM "Payment" WHERE "orderId" = '${orden.id}' AND "status" = 'REFUNDED'`)
assert.ok(reembolsoId, 'el reembolso quedó registrado')
sql(`UPDATE "Payment" SET "paidAt" = '${hoy}T04:00:00.000Z' WHERE "id" = '${reembolsoId}';`)
const auditoriaConReembolso = await req(`/api/cash/audit?branchId=${rama}&date=${hoy}`)
const cajaConReembolso = auditoriaConReembolso.methods.find((fila) => fila.method === 'CASH')
assert.equal(cajaConReembolso.refundedAmountPyg, esperadoDe(hoy).reembolsado, 'el reembolsado del día es el que salió de la caja')
assert.ok(cajaConReembolso.refundedAmountPyg >= reembolso, `incluye el reembolso de ${reembolso}`)

console.log(`PASS: día operativo de la auditoría en UTC-3 — cobro 00:30 PY en «${hoy}» (${esperadoHoy.confirmado} · ${esperadoHoy.cantidad} cobros), reembolso ${reembolso} informado · ${checks} chequeos`)
