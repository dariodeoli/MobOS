#!/usr/bin/env node
// Verificación independiente de reportes y comisiones (#148 §19, #83):
// recalcula DESDE LA BASE los números que devuelve la API —costo congelado por
// línea (unidad + reparaciones + repuestos + consignación + seguro + extras),
// descuento del carrito, líneas sin costo, comisión de procesadora y comisión
// del vendedor— y los compara uno a uno, también en los cortes por sucursal y
// por cliente. Es la red que cubre la cadena de costo real completa: si
// cualquier superficie se sale de la regla, esto falla.
//
// Uso: node reports-margen-db.mjs <BASE_URL> <ADMIN_TOKEN> <DATABASE_URL> <from> <to>
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const [base, admin, databaseUrl, from, to] = process.argv.slice(2)
if (!base || !admin || !databaseUrl || !from || !to) throw new Error('base, token admin, DATABASE_URL, from y to son obligatorios')

const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const TENANT = 'tenant-a-it'
const INT = (valor) => Number(valor)
let checks = 0

function sql(consulta) {
  const salida = execFileSync(`${PG_BIN}/psql`, [databaseUrl, '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' })
  return salida.split('\n').filter((linea) => linea.length).map((linea) => linea.split('\t'))
}

async function api(path) {
  const respuesta = await fetch(base + path, { headers: { Authorization: `Bearer ${admin}` } })
  const data = await respuesta.json()
  assert.equal(respuesta.status, 200, `${path}: ${JSON.stringify(data)}`)
  checks += 1
  return data
}

// Mismos límites que la API: día de Paraguay (UTC-3 fijo) sobre createdAt.
const inicioDeDia = (clave) => {
  const [y, m, d] = clave.split('-').map(Number)
  return Date.UTC(y, m - 1, d) + 180 * 60000
}
const start = new Date(inicioDeDia(from)).toISOString()
const end = new Date(inicioDeDia(to) + 86400000).toISOString()
const rango = `o."createdAt" >= '${start}' AND o."createdAt" < '${end}' AND o."status" <> 'CANCELLED'`

// ── Órdenes con sus líneas (sin fan-out: solo el join de items) ─────────────
// [id, sellerId, branchId, customerId, subtotal, discount, delivery, total,
//  conCosto, costo, sinCosto, lineasSinCosto, unidades]
const filasItems = sql(`SELECT o."id", COALESCE(o."sellerId", ''), COALESCE(o."branchId", ''), COALESCE(o."customerId", ''), o."subtotalPyg", o."discountPyg", o."deliveryPyg", o."totalPyg",
  COALESCE(SUM(i."totalPyg") FILTER (WHERE i."unitCostPyg" IS NOT NULL), 0),
  COALESCE(SUM(i."unitCostPyg"::bigint * i."quantity") FILTER (WHERE i."unitCostPyg" IS NOT NULL), 0),
  COALESCE(SUM(i."totalPyg") FILTER (WHERE i."unitCostPyg" IS NULL), 0),
  COUNT(*) FILTER (WHERE i."unitCostPyg" IS NULL),
  COALESCE(SUM(i.quantity), 0)
FROM "Order" o LEFT JOIN "OrderItem" i ON i."orderId" = o."id"
WHERE o."tenantId" = '${TENANT}' AND ${rango}
GROUP BY o."id"`)

// ── Cobros y comisión de procesadora por orden (join de pagos) ─────────────
// La foto congelada de la cuenta trae `feePercent`; el reporte la relee así.
const feePct = `CASE
  WHEN jsonb_typeof(p."accountSnapshot"->'feePercent') IN ('number', 'string')
    AND (p."accountSnapshot"->>'feePercent') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN (p."accountSnapshot"->>'feePercent')::numeric ELSE 0 END`
const filasPagos = new Map(sql(`SELECT o."id",
  COALESCE(SUM(p."amountPyg") FILTER (WHERE p.status = 'CONFIRMED'), 0),
  COALESCE(SUM(ROUND(p."amountPyg" * ${feePct} / 100)) FILTER (WHERE p.status = 'CONFIRMED' AND ${feePct} > 0), 0)
FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o."id"
WHERE o."tenantId" = '${TENANT}' AND ${rango}
GROUP BY o."id"`).map(([id, cobrado, comision]) => [id, { cobrado: INT(cobrado), comision: INT(comision) }]))

// ── Agregado por vendedor, sucursal y cliente con la misma regla ───────────
const vacio = () => ({ orders: 0, units: 0, grossPyg: 0, discountPyg: 0, deliveryPyg: 0, totalPyg: 0, collectedPyg: 0, pendingPyg: 0, costPyg: 0, profitPyg: 0, salesWithCostPyg: 0, salesWithoutCostPyg: 0, linesWithoutCost: 0, commissionPyg: 0, paidOrders: 0, pendingOrders: 0 })
const esperados = new Map()
const esperadosSucursal = new Map()
const esperadosCliente = new Map()
const sumar = (fila, campo, valor) => { fila[campo] += valor }

const registrar = (mapa, clave, datos, pago) => {
  const fila = mapa.get(clave) || vacio()
  // Regla única por venta: la venta con costo es neta del descuento del
  // carrito y la ganancia se pisa una sola vez; las líneas sin costo no suman.
  const base = Math.max(0, INT(datos.conCosto) - INT(datos.discount))
  fila.orders += 1
  sumar(fila, 'units', INT(datos.unidades))
  sumar(fila, 'grossPyg', INT(datos.subtotal))
  sumar(fila, 'discountPyg', INT(datos.discount))
  sumar(fila, 'deliveryPyg', INT(datos.delivery))
  sumar(fila, 'totalPyg', INT(datos.total))
  sumar(fila, 'collectedPyg', pago.cobrado)
  sumar(fila, 'costPyg', INT(datos.costo))
  sumar(fila, 'profitPyg', Math.max(0, base - INT(datos.costo)))
  sumar(fila, 'salesWithCostPyg', base)
  sumar(fila, 'salesWithoutCostPyg', INT(datos.sinCosto))
  sumar(fila, 'linesWithoutCost', INT(datos.lineasSinCosto))
  sumar(fila, 'commissionPyg', pago.comision)
  fila.pendingPyg = Math.max(0, fila.totalPyg - fila.collectedPyg)
  if (INT(datos.total) - pago.cobrado > 0) fila.pendingOrders += 1
  else fila.paidOrders += 1
  mapa.set(clave, fila)
}

for (const [id, sellerIdRaw, branchIdRaw, customerIdRaw, subtotal, discount, delivery, total, conCosto, costo, sinCosto, lineasSinCosto, unidades] of filasItems) {
  const pago = filasPagos.get(id) || { cobrado: 0, comision: 0 }
  const datos = { subtotal, discount, delivery, total, conCosto, costo, sinCosto, lineasSinCosto, unidades }
  registrar(esperados, sellerIdRaw || 'sin-vendedor', datos, pago)
  registrar(esperadosSucursal, branchIdRaw || 'sin-sucursal', datos, pago)
  registrar(esperadosCliente, customerIdRaw || 'sin-cliente', datos, pago)
}

const CAMPOS_GRUPO = ['orders', 'units', 'grossPyg', 'discountPyg', 'deliveryPyg', 'totalPyg', 'collectedPyg', 'pendingPyg', 'costPyg', 'profitPyg', 'salesWithoutCostPyg', 'linesWithoutCost', 'commissionPyg']
// Los totales suman los campos que los grupos no exponen (base del margen y
// estados de cobro), tal como los devuelve el contrato del reporte.
const CAMPOS_TOTALES = [...CAMPOS_GRUPO, 'salesWithCostPyg', 'paidOrders', 'pendingOrders']
const compararFila = (etiqueta, obtenido, esperado, campos) => {
  for (const campo of campos) {
    assert.equal(INT(obtenido[campo]), esperado[campo], `${etiqueta} · ${campo}`)
    checks += 1
  }
}

// ── Reporte por vendedor (mismo dato que muestra Reportes) ────────────────
const reporte = await api(`/api/reports?from=${from}&to=${to}&groupBy=seller`)
assert.equal(reporte.from, from)
assert.equal(reporte.to, to)
assert.equal(reporte.groups.length, esperados.size, `vendedores del período: API ${reporte.groups.length}, base ${esperados.size}`)
checks += 1
for (const grupo of reporte.groups) {
  const esperado = esperados.get(grupo.key)
  assert.ok(esperado, `la API trae un vendedor que la base no tiene: ${grupo.label}`)
  compararFila(`vendedor ${grupo.label}`, grupo, esperado, CAMPOS_GRUPO)
}
const totalesBase = [...esperados.values()].reduce((total, fila) => {
  for (const campo of CAMPOS_TOTALES) total[campo] += fila[campo] || 0
  return total
}, vacio())
compararFila('totales del período', reporte.totals, totalesBase, CAMPOS_TOTALES)

// ── Reportes por sucursal y por cliente: el mismo margen por venta ────────
for (const [groupBy, mapa, etiqueta] of [['branch', esperadosSucursal, 'sucursal'], ['customers', esperadosCliente, 'cliente']]) {
  const reporteGrupo = await api(`/api/reports?from=${from}&to=${to}&groupBy=${groupBy}`)
  assert.equal(reporteGrupo.groups.length, mapa.size, `${etiqueta}s del período: API ${reporteGrupo.groups.length}, base ${mapa.size}`)
  checks += 1
  for (const grupo of reporteGrupo.groups) {
    const esperado = mapa.get(grupo.key)
    assert.ok(esperado, `la API trae un ${etiqueta} que la base no tiene: ${grupo.label}`)
    compararFila(`${etiqueta} ${grupo.label}`, grupo, esperado, CAMPOS_GRUPO)
  }
  compararFila(`totales por ${etiqueta}`, reporteGrupo.totals, totalesBase, CAMPOS_TOTALES)
}

// ── Reporte de comisiones: mismo margen y mismo porcentaje ────────────────
const roles = new Map(sql(`SELECT "id", "role"::text FROM "User" WHERE "tenantId" = '${TENANT}'`))
const porUsuario = new Map()
const porRol = new Map()
for (const [userId, role, percent] of sql(`SELECT COALESCE("userId", ''), COALESCE("role"::text, ''), "percentPyg"::text FROM "CommissionRule" WHERE "tenantId" = '${TENANT}'`)) {
  const valor = Number(percent)
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) continue
  if (userId) porUsuario.set(userId, valor)
  if (role) porRol.set(role, valor)
}
const comisiones = await api(`/api/reports?type=commissions&from=${from}&to=${to}`)
assert.equal(comisiones.sellers.length, esperados.size, `vendedores del reporte de comisiones: API ${comisiones.sellers.length}, base ${esperados.size}`)
checks += 1
const esperadosComision = new Map()
for (const [sellerId, fila] of esperados) {
  const percent = sellerId === 'sin-vendedor' ? null : porUsuario.get(sellerId) ?? porRol.get(roles.get(sellerId) || '') ?? null
  esperadosComision.set(sellerId, { marginPyg: fila.profitPyg, percent, comision: percent === null ? 0 : Math.round((fila.profitPyg * percent) / 100) })
}
for (const fila of comisiones.sellers) {
  const esperado = esperadosComision.get(fila.sellerId)
  assert.ok(esperado, `la API trae una comisión sin ventas en la base: ${fila.sellerName}`)
  assert.equal(INT(fila.marginPyg), esperado.marginPyg, `comisión ${fila.sellerName} · margen`)
  assert.equal(INT(fila.commissionPyg), esperado.comision, `comisión ${fila.sellerName} · comisión`)
  assert.equal(fila.commissionPct, esperado.percent, `comisión ${fila.sellerName} · porcentaje`)
  checks += 3
}
const comisionTotal = [...esperadosComision.values()].reduce((total, fila) => total + fila.comision, 0)
const margenTotal = [...esperadosComision.values()].reduce((total, fila) => total + fila.marginPyg, 0)
assert.equal(INT(comisiones.totals.commissionPyg), comisionTotal, 'total de comisiones')
assert.equal(INT(comisiones.totals.marginPyg), margenTotal, 'total de margen de comisiones')
checks += 2

const ordenes = filasItems.length

// Autotest: si alguna superficie se desviara (p. ej. sin netear el descuento
// del carrito o contando una línea sin costo), la comparación lo detecta.
const muestra = reporte.groups[0]
if (muestra) {
  assert.throws(() => compararFila('autotest', { ...muestra, profitPyg: INT(muestra.profitPyg) + 1 }, esperados.get(muestra.key), ['profitPyg']))
  assert.throws(() => compararFila('autotest', { ...muestra, costPyg: INT(muestra.costPyg) + 1 }, esperados.get(muestra.key), ['costPyg']))
  checks += 2
}

console.log(`PASS: reportes y comisiones contra la base — ${ordenes} orden(es), ${esperados.size} vendedor(es), ${esperadosSucursal.size} sucursal(es), ${esperadosCliente.size} cliente(s), ${checks} comparaciones`)
