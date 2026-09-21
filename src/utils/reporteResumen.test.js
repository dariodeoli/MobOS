import assert from 'node:assert/strict'
import test from 'node:test'
import { armarResumenDia } from './reporteResumen.js'

// Agregados nuevos del resumen (#146): descuentos, costo de mercadería y
// ganancia del período con la misma regla que Ganancias (costo foto de la
// venta y, si falta, el costo actual del producto).

const rango = { desde: '2026-09-01', hasta: '2026-09-30' }
const prev = { desde: '2026-08-01', hasta: '2026-08-31' }

const ventas = [
  {
    id: 'v1',
    fecha: '2026-09-20',
    precio: 100000,
    estadoPago: 'Pagado',
    medioPago: 'Efectivo',
    vendedorId: 'a',
    precioCosto: 60000,
    discountPyg: 5000,
    items: [{ productId: 'p1', description: 'Cable', quantity: 1, unitPricePyg: 100000, totalPyg: 100000, discountPyg: 2000 }],
  },
  {
    id: 'v2',
    fecha: '2026-09-21',
    precio: 50000,
    estadoPago: 'Pendiente',
    medioPago: 'Transferencia',
    vendedorId: 'b',
    productoId: 'p2',
    items: [{ productId: 'p2', description: 'Funda', quantity: 2, unitPricePyg: 25000, totalPyg: 50000, discountPyg: 0, costPending: true }],
  },
  { id: 'v3', fecha: '2026-08-15', precio: 999000, estadoPago: 'Pagado' },
]

test('el resumen agrega descuentos, costo de mercadería y ganancia del período', () => {
  const d = armarResumenDia({
    ventas,
    gastos: [{ fecha: '2026-09-10', monto: 10000 }],
    prods: { p2: { precioCosto: 15000 } },
    rango,
    prev,
  })

  assert.equal(d.total, 150000)
  assert.equal(d.totalAnt, 999000)
  // Costo: foto de la venta (v1) + costo actual del producto cuando falta (v2).
  assert.equal(d.costoMercaderia, 75000)
  assert.equal(d.gastos, 10000)
  assert.equal(d.ganancia, 65000)
  // Descuentos: el extra del carrito más los de línea.
  assert.equal(d.descuentos, 7000)
  // La alerta de costo pendiente sigue viva para el reporte.
  assert.equal(d.sinCosto.lineas, 1)
  assert.equal(d.sinCosto.monto, 50000)
})

test('sin ventas ni gastos la ganancia queda en cero y no rompe', () => {
  const d = armarResumenDia({ ventas: [], gastos: [], rango, prev })
  assert.equal(d.total, 0)
  assert.equal(d.costoMercaderia, 0)
  assert.equal(d.ganancia, 0)
  assert.equal(d.descuentos, 0)
})
