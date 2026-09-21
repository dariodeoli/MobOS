import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// #171 (fase 2 de #145): indicadores del backend unificado de métricas.
// Uso: node reports-indicadores.mjs <respuesta-pagos> <respuesta-productos>
const [archivoPagos, archivoProductos] = process.argv.slice(2)
if (!archivoPagos || !archivoProductos) throw new Error('respuestas de payments y product requeridas')
let checks = 0

const pagos = JSON.parse(readFileSync(archivoPagos, 'utf8'))
const productos = JSON.parse(readFileSync(archivoProductos, 'utf8'))

// Corte por procesadora: los montos y el neto salen del corte de pagos.
assert.equal(pagos.groupBy, 'payments')
assert.ok(Array.isArray(pagos.groups))
assert.ok(pagos.totals.paidOrders !== undefined && pagos.totals.pendingOrders !== undefined, 'los totales exponen pedidos pagados y pendientes')
for (const grupo of pagos.groups) {
  assert.equal(typeof grupo.label, 'string')
  assert.equal(typeof grupo.totalPyg, 'number')
}
checks += 3

// Productos: curva ABC y stock valorizado/rotación calculados en el servidor.
assert.equal(productos.groupBy, 'product')
assert.ok(Array.isArray(productos.groups))
for (const grupo of productos.groups) {
  assert.ok(['A', 'B', 'C'].includes(grupo.abcClass), `clase ABC inválida: ${grupo.abcClass}`)
  assert.equal(typeof grupo.accumulatedPct, 'number')
}
assert.equal(typeof productos.inventory.stockValuePyg, 'number')
assert.equal(typeof productos.inventory.sellThroughPct, 'number')
assert.ok(productos.inventory.stockValuePyg >= 0)
if (productos.inventory.daysOfStock !== null) assert.equal(typeof productos.inventory.daysOfStock, 'number')
checks += 4

console.log(`Indicadores unificados de métricas: ${checks} comprobaciones OK`)
