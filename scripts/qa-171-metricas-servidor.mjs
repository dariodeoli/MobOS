// Verificación de la unificación Resumen/Análisis (#171, fase 2 de #145)
// contra la base: cada indicador del servidor se compara con un cálculo
// independiente en SQL sobre la misma ventana (últimos 30 días de Paraguay).
//
// Uso:
//   QA_BASE_URL=http://localhost:3115 QA_ORIGIN=http://localhost:5215 \
//   DATABASE_URL=postgresql://postgres@127.0.0.1:5515/mobos_e2e_MOS_FIN \
//   node scripts/qa-171-metricas-servidor.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { normalizarMetricas } from '../src/lib/metricasNucleo.js'
import { ticketPromedio } from '../src/utils/calculos.js'

const require = createRequire(import.meta.url)
const { Client } = require('../backend/node_modules/pg')

const API = process.env.QA_BASE_URL || 'http://localhost:3115'
const ORIGIN = process.env.QA_ORIGIN || 'http://localhost:5215'
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5515/mobos_e2e_MOS_FIN'
const EMAIL = process.env.QA_EMAIL || 'e2e-tienda@test.local'
const PASSWORD = process.env.QA_PASSWORD || 'E2e-password-123'
const PIN = process.env.QA_PIN || '1234'
const TZ = -180
const DIAS = 30

const resultados = []
let cookies = ''
const check = (nombre, esperado, obtenido) => {
  const ok = JSON.stringify(esperado) === JSON.stringify(obtenido)
  resultados.push({ nombre, ok, esperado, obtenido })
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${ok ? '' : ` — sql=${JSON.stringify(esperado)} api=${JSON.stringify(obtenido)}`}`)
}

async function api(path, opciones = {}) {
  const respuesta = await fetch(`${API}${path}`, {
    method: opciones.method || 'GET',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookies ? { cookie: cookies } : {}) },
    ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {}),
  })
  const setCookie = respuesta.headers.getSetCookie?.() || []
  if (setCookie.length) cookies = setCookie.map((fila) => fila.split(';')[0]).join('; ')
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(`${path} → ${respuesta.status}: ${JSON.stringify(datos)}`)
  return datos
}

// ── Sesión de administración del entorno local (seed de e2e) ────────────────
const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD, deviceId: 'qa-171' } })
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
assert.ok(admin, 'no encontré al administrador del seed')
const pin = await api('/api/auth/pin', { method: 'POST', body: { sellerId: admin.id, pin: PIN } })
const tenantId = pin.user.tenantId

// ── Ventana: los últimos 30 días locales de Paraguay ────────────────────────
const aFecha = (ms) => new Date(ms + TZ * 60000).toISOString().slice(0, 10)
const aUtc = (fecha) => {
  const [y, m, d] = fecha.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - TZ * 60000
}
const hoy = aFecha(Date.now())
const desde = aFecha(aUtc(hoy) - (DIAS - 1) * 86400000)
const start = new Date(aUtc(desde))
const end = new Date(aUtc(hoy) + 86400000)
const rango = `from=${desde}&to=${hoy}`
console.log(`Ventana ${desde} → ${hoy} (Paraguay, UTC-3)\n`)

// ── Respuestas del servidor ─────────────────────────────────────────────────
const params = (extra) => `${rango}&tzOffset=${TZ}&${extra}`
const dia = await api(`/api/reports?${params('groupBy=day')}`)
const productos = await api(`/api/reports?${params('groupBy=product')}`)
const procesadoras = await api(`/api/reports?${params('groupBy=payments&paymentsBy=processor')}`)
const cuentas = await api(`/api/reports?${params('groupBy=payments&paymentsBy=account')}`)
const conciliacion = await api(`/api/finance/reconciliation?${rango}&soloResumen=1`)

// ── Verdad de control en SQL ────────────────────────────────────────────────
const db = new Client({ connectionString: DATABASE_URL })
await db.connect()
const rangoSql = [tenantId, start.toISOString(), end.toISOString()]
const q = async (sql, valores = rangoSql) => (await db.query(sql, valores)).rows

const [ordenes] = await q(`
  SELECT COUNT(*) FILTER (WHERE o.status <> 'CANCELLED') AS orders,
         COALESCE(SUM(o."subtotalPyg") FILTER (WHERE o.status <> 'CANCELLED'), 0) AS gross,
         COALESCE(SUM(o."discountPyg") FILTER (WHERE o.status <> 'CANCELLED'), 0) AS discount,
         COALESCE(SUM(o."deliveryPyg") FILTER (WHERE o.status <> 'CANCELLED'), 0) AS delivery,
         COALESCE(SUM(o."totalPyg") FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total
  FROM "Order" o
  WHERE o."tenantId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3`)

const [lineas] = await q(`
  WITH ordenes AS (
    SELECT o.id, o."totalPyg" FROM "Order" o
    WHERE o."tenantId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3 AND o.status <> 'CANCELLED'
  ), porOrden AS (
    SELECT i."orderId",
           SUM(i.quantity)::int AS units,
           SUM(CASE WHEN i."unitCostPyg" IS NOT NULL THEN i."unitCostPyg" * i.quantity ELSE 0 END) AS costo,
           SUM(CASE WHEN i."unitCostPyg" IS NOT NULL THEN i."totalPyg" ELSE 0 END) AS con_costo,
           SUM(CASE WHEN i."unitCostPyg" IS NULL THEN 1 ELSE 0 END)::int AS sin_costo,
           SUM(CASE WHEN i."unitCostPyg" IS NULL THEN i."totalPyg" ELSE 0 END) AS sin_costo_monto
    FROM "OrderItem" i JOIN ordenes o ON o.id = i."orderId"
    GROUP BY i."orderId"
  ), conPagos AS (
    SELECT o.id, o."totalPyg", p.units, p.costo, p.con_costo, p.sin_costo, p.sin_costo_monto,
           COALESCE((SELECT SUM(g."amountPyg") FROM "Payment" g WHERE g."orderId" = o.id AND g.status = 'CONFIRMED'), 0) AS cobrado,
           COALESCE((SELECT SUM(ROUND(g."amountPyg" * (g."accountSnapshot"->>'feePercent')::numeric / 100))
                     FROM "Payment" g
                     WHERE g."orderId" = o.id AND g.status = 'CONFIRMED'
                       AND (g."accountSnapshot"->>'feePercent') ~ '^-?[0-9.]+$'
                       AND (g."accountSnapshot"->>'feePercent')::numeric > 0), 0) AS comision
    FROM ordenes o LEFT JOIN porOrden p ON p."orderId" = o.id
  )
  SELECT COALESCE(SUM(units), 0)::int AS units,
         COALESCE(SUM(con_costo), 0) AS sales_with_cost,
         COALESCE(SUM(sin_costo), 0)::int AS lines_without_cost,
         COALESCE(SUM(sin_costo_monto), 0) AS sales_without_cost,
         COALESCE(SUM(costo), 0) AS cost,
         COALESCE(SUM(GREATEST(0, con_costo - costo)), 0) AS profit,
         COALESCE(SUM(cobrado), 0) AS collected,
         COALESCE(SUM(comision), 0) AS commission,
         COUNT(*) FILTER (WHERE GREATEST(0, "totalPyg" - cobrado) > 0)::int AS pending_orders,
         COUNT(*) FILTER (WHERE GREATEST(0, "totalPyg" - cobrado) <= 0)::int AS paid_orders
  FROM conPagos`)

const [inventario] = await q(`
  SELECT COALESCE(SUM(stock), 0)::int AS on_hand,
         COALESCE(SUM(GREATEST(stock, 0) * GREATEST(COALESCE("costPyg", 0), 0)), 0) AS stock_value,
         COUNT(*) FILTER (WHERE stock > 0 AND "costPyg" IS NULL)::int AS stock_without_cost,
         COUNT(*) FILTER (WHERE stock <= 0)::int AS shortages
  FROM "Product"
  WHERE "tenantId" = $1 AND "isActive" = true`, [tenantId])

const [vendidas] = await q(`
  SELECT COALESCE(SUM(i.quantity), 0)::int AS sold_units
  FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
  WHERE o."tenantId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3
    AND o.status <> 'CANCELLED' AND i."productId" IS NOT NULL`)

const productosSql = await q(`
  WITH ordenes AS (
    SELECT o.id FROM "Order" o
    WHERE o."tenantId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3 AND o.status <> 'CANCELLED'
  ), filas AS (
    SELECT COALESCE(i."productId", 'desc:' || lower(btrim(i.description))) AS key, i."totalPyg" AS monto
    FROM "OrderItem" i JOIN ordenes o ON o.id = i."orderId"
  ), grupos AS (
    SELECT key, SUM(monto) AS gross FROM filas GROUP BY key
  ), total AS (SELECT SUM(gross) AS total FROM grupos)
  SELECT p.key, p.gross,
         COALESCE((SELECT SUM(q.gross) FROM grupos q WHERE q.gross > p.gross), 0) AS mayor,
         COALESCE((SELECT SUM(q.gross) FROM grupos q WHERE q.gross >= p.gross), 0) AS hasta,
         total.total AS total
  FROM grupos p, total
  ORDER BY p.gross DESC, p.key`)

const pagosPor = async (corte) => q(`
  SELECT ${corte === 'processor'
    ? `COALESCE(NULLIF(btrim(p."accountSnapshot"->>'processor'), ''), 'sin-procesadora')`
    : `COALESCE(p."accountSnapshot"->>'id', 'metodo:' || lower(p.method::text), 'sin-metodo')`} AS key,
         COUNT(*) FILTER (WHERE p.status <> 'REFUNDED')::int AS operaciones,
         COALESCE(SUM(p."amountPyg") FILTER (WHERE p.status <> 'REFUNDED'), 0) AS monto,
         COALESCE(SUM(p."amountPyg") FILTER (WHERE p.status = 'REFUNDED'), 0) AS reembolsado
  FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
  WHERE o."tenantId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3 AND o.status <> 'CANCELLED'
  GROUP BY 1`)

const procesadorasSql = await pagosPor('processor')
const cuentasSql = await pagosPor('account')

const [conciliacionSql] = await q(`
  WITH pagos AS (
    SELECT p.id, p.status, p."amountPyg", r.state
    FROM "Payment" p
    LEFT JOIN "PaymentReconciliation" r ON r."paymentId" = p.id
    WHERE p."tenantId" = $1
      AND p.method IN ('CASH', 'TRANSFER', 'CARD', 'TRADE_IN', 'PIX', 'CRYPTO')
      AND p.status IN ('CONFIRMED', 'PENDING', 'REFUNDED')
      AND p."paidAt" >= $2 AND p."paidAt" < $3
  )
  SELECT COUNT(*)::int AS count,
         COALESCE(SUM("amountPyg") FILTER (WHERE status = 'CONFIRMED'), 0) AS confirmed,
         COALESCE(SUM("amountPyg") FILTER (WHERE status = 'PENDING'), 0) AS pending,
         COALESCE(SUM("amountPyg") FILTER (WHERE status = 'REFUNDED'), 0) AS refunded,
         COALESCE(SUM("amountPyg") FILTER (WHERE status = 'CONFIRMED' AND state = 'VERIFIED'), 0) AS verified,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND state = 'VERIFIED')::int AS verified_count,
         COALESCE(SUM("amountPyg") FILTER (WHERE status = 'CONFIRMED' AND (state IS NULL OR state <> 'VERIFIED')), 0) AS unverified,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND (state IS NULL OR state <> 'VERIFIED'))::int AS pending_count
  FROM pagos`)

const [lotesSql] = await q(`
  SELECT COALESCE(SUM("differencePyg") FILTER (WHERE state <> 'REJECTED' AND "differencePyg" <> 0), 0) AS difference,
         COUNT(*)::int AS lotes,
         COUNT(*) FILTER (WHERE state <> 'REJECTED' AND "differencePyg" <> 0)::int AS lotes_con_diferencia
  FROM "ReconciliationBatch"
  WHERE "tenantId" = $1 AND "from" < $3 AND "to" >= $2`, rangoSql)
await db.end()

// ── Comparaciones: totales del período ──────────────────────────────────────
const t = dia.totals
check('totales.pedidos', Number(ordenes.orders), t.orders)
check('totales.facturado', Number(ordenes.total), t.totalPyg)
check('totales.bruto (subtotal)', Number(ordenes.gross), t.grossPyg)
check('totales.descuentos', Number(ordenes.discount), t.discountPyg)
check('totales.delivery', Number(ordenes.delivery), t.deliveryPyg)
check('totales.unidades', lineas.units, t.units)
check('totales.cobrado', Number(lineas.collected), t.collectedPyg)
check('totales.pendiente', Math.max(0, Number(ordenes.total) - Number(lineas.collected)), t.pendingPyg)
check('totales.costo', Number(lineas.cost), t.costPyg)
check('totales.ganancia (profit)', Number(lineas.profit), t.profitPyg)
check('totales.comisión de cobro', Number(lineas.commission), t.commissionPyg)
check('totales.pedidosPagados', lineas.paid_orders, t.paidOrders)
check('totales.pedidosPendientes', lineas.pending_orders, t.pendingOrders)
check('totales.líneasSinCosto', lineas.lines_without_cost, t.linesWithoutCost)
check('totales.ventasSinCosto', Number(lineas.sales_without_cost), t.salesWithoutCostPyg)
check('totales.netProfit', Math.max(0, Number(lineas.profit) - Number(lineas.commission)), t.netProfitPyg)

// ── Curva ABC por producto ──────────────────────────────────────────────────
// Con ventas empatadas, el % acumulado depende del orden interno (el servidor
// respeta el orden de aparición). Se valida el rango posible de cada producto:
// entre el acumulado de los que venden más y el de los que venden igual o más,
// y que la clase coincida con el % que el propio servidor informa.
const abcApi = new Map(productos.groups.map((grupo) => [grupo.key, grupo]))
const pct = (suma, total) => (Number(total) > 0 ? Math.round((Number(suma) / Number(total)) * 1000) / 10 : 0)
const claseDe = (valor, total) => (Number(total) > 0 ? (valor <= 80 ? 'A' : valor <= 95 ? 'B' : 'C') : 'C')
check('ABC.productos (cantidad de grupos)', productosSql.length, productos.groups.length)
let abcOk = 0
const abcFallos = []
for (const fila of productosSql) {
  const grupo = abcApi.get(fila.key)
  const bajo = pct(Number(fila.mayor) + Number(fila.gross), fila.total)
  const alto = pct(fila.hasta, fila.total)
  const enRango = grupo && grupo.accumulatedPct >= bajo - 0.05 && grupo.accumulatedPct <= alto + 0.05
  const claseCoherente = grupo && claseDe(grupo.accumulatedPct, fila.total) === grupo.abcClass
  if (grupo && grupo.grossPyg === Number(fila.gross) && enRango && claseCoherente) abcOk += 1
  else abcFallos.push({ key: fila.key, esperado: { grossPyg: Number(fila.gross), pctEntre: [bajo, alto] }, obtenido: grupo })
}
check(`ABC.monto, % y clase por producto (${abcOk}/${productosSql.length})`, true, abcFallos.length === 0)
if (abcFallos.length) console.log(abcFallos.slice(0, 6).map((fila) => `   ${fila.key}: sql=${JSON.stringify(fila.esperado)} api=${JSON.stringify(fila.obtenido)}`).join('\n'))
const clasesApi = productos.groups.reduce((acc, grupo) => ({ ...acc, [grupo.abcClass]: (acc[grupo.abcClass] || 0) + 1 }), {})
const clasesSql = productosSql.reduce((acc, fila) => {
  const grupo = abcApi.get(fila.key)
  const clase = grupo?.abcClass || 'C'
  return { ...acc, [clase]: (acc[clase] || 0) + 1 }
}, {})
check('ABC.resumen por clase', clasesSql, clasesApi)

// ── Inventario: stock valorizado y rotación ─────────────────────────────────
const inv = productos.inventory
const ventaDiaria = Number(vendidas.sold_units) / DIAS
check('stock.unidades', Number(inventario.on_hand), inv.onHandUnits)
check('stock.valorizado', Number(inventario.stock_value), inv.stockValuePyg)
check('stock.sinCosto', Number(inventario.stock_without_cost), inv.stockWithoutCost)
check('stock.unidadesVendidas', Number(vendidas.sold_units), inv.soldUnits)
check('stock.faltantes', Number(inventario.shortages), inv.shortages.length)
check('stock.diasDeStock', ventaDiaria > 0 ? Math.round((Number(inventario.on_hand) / ventaDiaria) * 10) / 10 : null, inv.daysOfStock)
check('stock.rotacionPct', Number(inventario.on_hand) + Number(vendidas.sold_units) > 0
  ? Math.round((Number(vendidas.sold_units) / (Number(inventario.on_hand) + Number(vendidas.sold_units))) * 1000) / 10
  : null, inv.sellThroughPct)

// ── Pagos por procesadora y por cuenta ──────────────────────────────────────
const filasDePago = (groups, keySql) => {
  const mapa = new Map(groups.map((grupo) => [String(grupo.key).toLowerCase(), grupo]))
  return keySql.map((fila) => ({
    key: fila.key,
    operaciones: fila.operaciones,
    monto: Number(fila.monto),
    reembolsado: Number(fila.reembolsado),
    api: mapa.get(String(fila.key).toLowerCase()) || null,
  }))
}
for (const [etiqueta, filas] of [['procesadora', filasDePago(procesadoras.groups, procesadorasSql)], ['cuenta', filasDePago(cuentas.groups, cuentasSql)]]) {
  const fallos = filas.filter((fila) => !fila.api || fila.api.units !== fila.operaciones || fila.api.totalPyg !== fila.monto || fila.api.refundedPyg !== fila.reembolsado)
  check(`pagos por ${etiqueta} (${filas.length} corte(s))`, true, fallos.length === 0)
  if (fallos.length) console.log(fallos.slice(0, 5).map((fila) => `   ${fila.key}: sql=${JSON.stringify({ operaciones: fila.operaciones, monto: fila.monto, reembolsado: fila.reembolsado })} api=${JSON.stringify(fila.api)}`).join('\n'))
}

// ── Conciliación (resumen liviano) ──────────────────────────────────────────
const r = conciliacion.resumen
check('conciliación.operaciones', conciliacionSql.count, r.count)
check('conciliación.confirmado', Number(conciliacionSql.confirmed), r.confirmedPyg)
check('conciliación.pendiente', Number(conciliacionSql.pending), r.pendingPyg)
check('conciliación.reembolsado', Number(conciliacionSql.refunded), r.refundedPyg)
check('conciliación.verificado', Number(conciliacionSql.verified), r.verifiedPyg)
check('conciliación.verificados (conteo)', conciliacionSql.verified_count, r.verifiedCount)
check('conciliación.porConciliar', Number(conciliacionSql.unverified), r.porConciliar)
check('conciliación.porConciliar (conteo)', conciliacionSql.pending_count, r.pendingCount)
check('conciliación.diferencia', Number(lotesSql.difference), r.differencePyg)
check('conciliación.lotes (del período)', lotesSql.lotes, r.lotes)

// ── El adaptador que consume la UI no pierde ni inventa nada ────────────────
const m = normalizarMetricas({ dia, productos, procesadoras, cuentas, conciliacion })
check('adaptador.facturado', t.totalPyg, m.total)
check('adaptador.cobrado', t.collectedPyg, m.cobrado)
check('adaptador.pendiente', t.pendingPyg, m.pendiente)
check('adaptador.pedidos', t.orders, m.pedidos)
check('adaptador.pedidosPagados', t.paidOrders, m.pedidosPagados)
check('adaptador.pedidosPendientes', t.pendingOrders, m.pedidosPendientes)
check('adaptador.unidades', t.units, m.unidades)
check('adaptador.ticket', ticketPromedio(t.totalPyg, t.orders), m.ticket)
check('adaptador.serie (días)', dia.groups.length, m.serie.length)
check('adaptador.topProductos (clase ABC del primero)', productos.groups[0]?.abcClass, m.topProductos[0]?.clase)
check('adaptador.curva total', productos.groups.reduce((suma, grupo) => suma + grupo.grossPyg, 0), m.curva.A.monto + m.curva.B.monto + m.curva.C.monto)
check('adaptador.stock.valorizado', inv.stockValuePyg, m.inventario.valorPyg)
check('adaptador.stock.diasDeStock', inv.daysOfStock, m.inventario.diasDeStock)
check('adaptador.procesadoras (filas)', filasDePago(procesadoras.groups, procesadorasSql).length, m.procesadoras.length)
check('adaptador.cuentas (filas)', filasDePago(cuentas.groups, cuentasSql).length, m.cuentas.length)
check('adaptador.conciliacion.diferencia', r.differencePyg, m.conciliacion.diferenciaPyg)
check('adaptador.conciliacion.lotes', r.lotes, m.conciliacion.lotes)

const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) {
  console.log(fallos.map((fila) => `- ${fila.nombre}: sql=${JSON.stringify(fila.esperado)} api=${JSON.stringify(fila.obtenido)}`).join('\n'))
  process.exitCode = 1
}
