import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularLiquidacionComisiones } from '../lib/commission-settlements'
import type { OrderLike } from '../lib/reporting'

// Bordes del cálculo de la liquidación: sin ventas, período vacío, comisión 0,
// ventas de varios vendedores, canceladas y redondeo. La función es pura: no
// toca la base, así que estos casos cubren la regla completa del comprobante.

const venta = (overrides: Partial<OrderLike> = {}): OrderLike => ({
  id: 'o1',
  status: 'COMPLETED',
  subtotalPyg: 100000,
  totalPyg: 100000,
  sellerId: 'v1',
  createdAt: '2026-09-10T15:00:00.000Z',
  items: [{ productId: 'p1', description: 'Case', quantity: 1, unitCostPyg: 60000, totalPyg: 100000 }],
  ...overrides,
})

const VENDEDOR = { id: 'v1', name: 'Vendedor Uno', role: 'VENDEDOR' }

test('sin ventas no hay liquidación y se informa el motivo', () => {
  const resultado = calcularLiquidacionComisiones({ orders: [], rules: [{ userId: 'v1', percentPyg: 10 }], seller: VENDEDOR, periodTo: '2026-09-30' })
  assert.equal(resultado.ok, false)
  if (!resultado.ok) assert.equal(resultado.code, 'SIN_VENTAS')
})

test('período sin ventas del vendedor tampoco liquida', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [venta({ id: 'ajena', sellerId: 'v2' })],
    rules: [{ userId: 'v1', percentPyg: 10 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, false)
  if (!resultado.ok) assert.equal(resultado.code, 'SIN_VENTAS')
})

test('sin regla vigente no se inventa un porcentaje', () => {
  const resultado = calcularLiquidacionComisiones({ orders: [venta()], rules: [], seller: VENDEDOR, periodTo: '2026-09-30' })
  assert.equal(resultado.ok, false)
  if (!resultado.ok) assert.equal(resultado.code, 'SIN_REGLA')
})

test('comisión 0 deja el total en cero pero conserva el detalle', () => {
  const resultado = calcularLiquidacionComisiones({ orders: [venta()], rules: [{ userId: 'v1', percentPyg: 0 }], seller: VENDEDOR, periodTo: '2026-09-30', orderNumbers: { o1: 'MOB-0001' } })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  assert.equal(resultado.totalPyg, 0)
  assert.equal(resultado.marginPyg, 40000)
  assert.equal(resultado.commissionPct, 0)
  assert.equal(resultado.lines.length, 1)
  assert.equal(resultado.lines[0].commissionPyg, 0)
  assert.equal(resultado.lines[0].basePyg, 40000)
  assert.equal(resultado.lines[0].orderNumber, 'MOB-0001')
})

test('varias ventas del mismo vendedor se acumulan y el margen sale de los costos', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [
      venta({ id: 'o1', totalPyg: 100000, items: [{ quantity: 1, unitCostPyg: 60000, totalPyg: 100000 }] }),
      venta({ id: 'o2', totalPyg: 200000, items: [{ quantity: 2, unitCostPyg: 50000, totalPyg: 200000 }] }),
    ],
    rules: [{ userId: 'v1', percentPyg: 10 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  // Margen: (100000-60000) + (200000-100000) = 140000; 10% = 14000.
  assert.equal(resultado.marginPyg, 140000)
  assert.equal(resultado.totalPyg, 14000)
  assert.equal(resultado.orders, 2)
  assert.equal(resultado.lines.length, 2)
})

test('las ventas de otros vendedores no entran en la liquidación', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [
      venta({ id: 'propia', sellerId: 'v1', totalPyg: 100000 }),
      venta({ id: 'ajena', sellerId: 'v2', totalPyg: 900000, items: [{ quantity: 1, unitCostPyg: 100000, totalPyg: 900000 }] }),
    ],
    rules: [
      { userId: 'v1', percentPyg: 10 },
      { userId: 'v2', percentPyg: 50 },
    ],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  assert.equal(resultado.orders, 1)
  assert.equal(resultado.lines.length, 1)
  assert.equal(resultado.marginPyg, 40000)
  assert.equal(resultado.totalPyg, 4000)
})

test('una venta cancelada no suma ni aparece en el detalle', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [venta({ id: 'viva' }), venta({ id: 'anulada', status: 'CANCELLED' })],
    rules: [{ userId: 'v1', percentPyg: 10 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  assert.equal(resultado.orders, 1)
  assert.equal(resultado.lines.length, 1)
  assert.equal(resultado.totalPyg, 4000)
})

test('la regla por usuario prevalece sobre la del rol', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [venta()],
    rules: [{ role: 'VENDEDOR', percentPyg: 2 }, { userId: 'v1', percentPyg: 25 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  assert.equal(resultado.commissionPct, 25)
  assert.equal(resultado.totalPyg, 10000)
  assert.equal(resultado.lines[0].commissionPct, 25)
})

test('sin regla por usuario cae a la del rol', () => {
  const resultado = calcularLiquidacionComisiones({ orders: [venta()], rules: [{ role: 'VENDEDOR', percentPyg: 5 }], seller: VENDEDOR, periodTo: '2026-09-30' })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  assert.equal(resultado.commissionPct, 5)
  assert.equal(resultado.totalPyg, 2000)
})

test('el desfasaje de redondeo se explicita en una línea de ajuste', () => {
  // Dos ventas de margen 3 al 50%: por venta se redondea 1,5 → 2 (suma 4) y
  // sobre el acumulado 3; la diferencia -1 debe quedar explícita para cuadrar.
  const resultado = calcularLiquidacionComisiones({
    orders: [
      venta({ id: 'o1', totalPyg: 100, items: [{ quantity: 1, unitCostPyg: 97, totalPyg: 100 }] }),
      venta({ id: 'o2', totalPyg: 100, items: [{ quantity: 1, unitCostPyg: 97, totalPyg: 100 }] }),
    ],
    rules: [{ userId: 'v1', percentPyg: 50 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  const ajuste = resultado.lines.find(line => line.orderNumber === 'Ajuste por redondeo')
  assert.ok(ajuste, 'debe existir la línea de ajuste')
  const suma = resultado.lines.reduce((total, line) => total + line.commissionPyg, 0)
  assert.equal(suma, resultado.totalPyg)
})

test('la fecha de cada línea usa el día local de la empresa', () => {
  const resultado = calcularLiquidacionComisiones({
    orders: [venta({ createdAt: '2026-09-11T02:00:00.000Z' })],
    rules: [{ userId: 'v1', percentPyg: 10 }],
    seller: VENDEDOR,
    periodTo: '2026-09-30',
    offsetMinutes: -180,
  })
  assert.equal(resultado.ok, true)
  if (!resultado.ok) return
  // 02:00 UTC del 11-09 es 23:00 del 10-09 en Paraguay.
  assert.equal(resultado.lines[0].date, '2026-09-10')
})
