import assert from 'node:assert/strict'
import test from 'node:test'
import { filasDePagos, normalizarMetricas, resumenCurva, topProductos } from './metricasNucleo.js'

// #171 (fase 2 de #145): el adaptador de métricas es la única puerta de la
// vista ejecutiva y la extendida. Estos tests fijan el contrato normalizado.

const grupoPago = (over = {}) => ({ key: 'k', label: 'L', totalPyg: 0, units: 0, refundedPyg: 0, ...over })

test('filasDePagos: etiqueta humana para medios y orden por monto', () => {
  const filas = filasDePagos([
    grupoPago({ key: 'cash', label: 'CASH', totalPyg: 100000, units: 3 }),
    grupoPago({ key: 'metodo:transfer', label: 'TRANSFER', totalPyg: 250000, units: 2 }),
    grupoPago({ key: 'bancard', label: 'Bancard', totalPyg: 50000, units: 1 }),
    grupoPago({ key: 'acc-1', label: 'Tarjeta Itaú', totalPyg: 0, units: 0 }),
  ])
  assert.deepEqual(filas.map((fila) => [fila.label, fila.monto, fila.operaciones]), [
    ['Transferencia', 250000, 2],
    ['Efectivo', 100000, 3],
    ['Bancard', 50000, 1],
  ])
})

test('resumenCurva: agrupa productos y montos por clase', () => {
  const curva = resumenCurva([
    { grossPyg: 800, abcClass: 'A' },
    { grossPyg: 150, abcClass: 'B' },
    { grossPyg: 50, abcClass: 'C' },
    { grossPyg: 10 },
  ])
  assert.deepEqual(curva, {
    A: { productos: 1, monto: 800 },
    B: { productos: 1, monto: 150 },
    C: { productos: 2, monto: 60 },
  })
})

test('topProductos: corta el límite y conserva la clase ABC', () => {
  const top = topProductos([
    { key: 'p1', label: 'iPhone', units: 3, grossPyg: 900000, abcClass: 'A', accumulatedPct: 90 },
    { key: 'p2', label: 'Funda', units: 5, grossPyg: 100000, abcClass: 'B', accumulatedPct: 100 },
  ], 1)
  assert.deepEqual(top, [{
    id: 'p1', nombre: 'iPhone', cantidad: 3, monto: 900000, ganancia: 0, margenPct: 0,
    sinCosto: 0, clase: 'A', acumuladoPct: 90,
  }])
})

test('topProductos: con costos congelados ordena por ganancia y calcula el margen', () => {
  const grupos = [
    { key: 'p1', label: 'iPhone', units: 2, grossPyg: 1000000, profitPyg: 100000 },
    { key: 'p2', label: 'Funda', units: 6, grossPyg: 300000, profitPyg: 150000 },
    { key: 'p3', label: 'Sin costo', units: 1, grossPyg: 50000, profitPyg: 0, salesWithoutCostPyg: 50000 },
  ]
  const porGanancia = topProductos(grupos, 8, 'ganancia')
  assert.deepEqual(porGanancia.map((f) => f.nombre), ['Funda', 'iPhone', 'Sin costo'])
  assert.equal(porGanancia[0].margenPct, 50)
  assert.equal(porGanancia[2].sinCosto, 50000)
  // El criterio por venta conserva el orden del backend (curva ABC por venta).
  assert.deepEqual(topProductos(grupos, 8, 'venta').map((f) => f.nombre), ['iPhone', 'Funda', 'Sin costo'])
})

test('normalizarMetricas: contrato estable de la portada ejecutiva', () => {
  const metricas = normalizarMetricas({
    dia: {
      from: '2026-09-01', to: '2026-09-30', generatedAt: '2026-09-30T12:00:00.000Z', truncated: false,
      totals: { orders: 4, units: 6, totalPyg: 1000000, collectedPyg: 600000, pendingPyg: 400000, paidOrders: 3, pendingOrders: 1, linesWithoutCost: 2, salesWithoutCostPyg: 150000 },
      previous: { totals: { orders: 2, totalPyg: 500000 } },
      groups: [{ key: '2026-09-01', totalPyg: 400000 }, { key: '2026-09-02', totalPyg: 600000 }],
    },
    productos: {
      inventory: { onHandUnits: 12, stockValuePyg: 8000000, sellThroughPct: 33.3, daysOfStock: 20.5, stockWithoutCost: 1, shortages: [{ id: 'p9', name: 'Sin stock' }] },
      groups: [{ key: 'p1', label: 'iPhone', units: 2, grossPyg: 800000, abcClass: 'A', accumulatedPct: 80 }],
    },
    procesadoras: { groups: [{ key: 'bancard', label: 'Bancard', totalPyg: 500000, units: 2 }] },
    cuentas: { groups: [{ key: 'acc-1', label: 'Itaú · Darío', totalPyg: 500000, units: 2 }] },
    conciliacion: { resumen: { count: 7, verifiedPyg: 300000, porConciliar: 200000, differencePyg: -15000, lotes: 2 } },
  })

  assert.equal(metricas.fuente, 'api')
  assert.equal(metricas.total, 1000000)
  assert.equal(metricas.totalAnterior, 500000)
  assert.equal(metricas.cobrado, 600000)
  assert.equal(metricas.pendiente, 400000)
  assert.equal(metricas.pedidos, 4)
  assert.equal(metricas.pedidosPagados, 3)
  assert.equal(metricas.pedidosPendientes, 1)
  assert.equal(metricas.ticket, 250000)
  assert.equal(metricas.ticketAnterior, 250000)
  assert.deepEqual(metricas.serie, [['2026-09-01', 400000], ['2026-09-02', 600000]])
  assert.deepEqual(metricas.sinCosto, { lineas: 2, monto: 150000 })
  assert.equal(metricas.topProductos[0].clase, 'A')
  assert.equal(metricas.curva.A.monto, 800000)
  assert.equal(metricas.inventario.valorPyg, 8000000)
  assert.equal(metricas.inventario.diasDeStock, 20.5)
  assert.equal(metricas.procesadoras[0].label, 'Bancard')
  assert.equal(metricas.cuentas[0].label, 'Itaú · Darío')
  assert.deepEqual(metricas.conciliacion, { operaciones: 7, conciliadoPyg: 300000, porConciliarPyg: 200000, diferenciaPyg: -15000, lotes: 2 })
})

test('normalizarMetricas: avisa cuando el reporte viene truncado (#171)', () => {
  assert.equal(normalizarMetricas({ dia: { truncated: true, totals: {} } }).truncado, true)
  assert.equal(normalizarMetricas({ productos: { truncated: true, totals: {} } }).truncado, true)
  assert.equal(normalizarMetricas({ dia: { truncated: false, totals: {} }, productos: { truncated: false } }).truncado, false)
})

test('normalizarMetricas: sin datos devuelve ceros y nunca lanza', () => {
  const metricas = normalizarMetricas()
  assert.equal(metricas.total, 0)
  assert.equal(metricas.ticket, 0)
  assert.equal(metricas.pedidosPagados, 0)
  assert.deepEqual(metricas.serie, [])
  assert.deepEqual(metricas.topProductos, [])
  assert.equal(metricas.inventario.valorPyg, 0)
  assert.equal(metricas.conciliacion.diferenciaPyg, 0)
  // `paidOrders` ausente cae al total de pedidos (compatibilidad).
  assert.equal(normalizarMetricas({ dia: { totals: { orders: 3, totalPyg: 300 } } }).pedidosPagados, 3)
})
