import test from 'node:test'
import assert from 'node:assert/strict'
import { tableroPos, comparacion, diaDe } from './posAnalytics.js'

const orden = (fecha, total, payments, items, extras = {}) => ({
  createdAt: `${fecha}T12:00:00`,
  totalPyg: total,
  payments,
  items,
  ...extras,
})

const PAGO = (monto, method = 'CASH') => ({ status: 'CONFIRMED', amountPyg: monto, method })

test('el tablero separa hoy de ayer y calcula AOV, items por pedido y net sales', () => {
  const ordenes = [
    orden('2026-09-20', 100000, [PAGO(100000)], [{ productId: 'a', description: 'A', quantity: 2, unitPricePyg: 50000, totalPyg: 100000 }], { discountPyg: 10000 }),
    orden('2026-09-20', 50000, [PAGO(20000)], [{ productId: 'b', description: 'B', quantity: 1, unitPricePyg: 50000, totalPyg: 50000 }]),
    orden('2026-09-19', 80000, [PAGO(80000)], [{ productId: 'a', description: 'A', quantity: 1, unitPricePyg: 80000, totalPyg: 80000 }]),
    orden('2026-09-20', 999999, [PAGO(999999)], [], { status: 'CANCELLED' }),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19' })
  assert.equal(t.hoy.pedidos, 2, 'el cancelado no cuenta')
  assert.equal(t.hoy.ventas, 150000)
  assert.equal(t.hoy.neto, 150000, 'net sales = lo facturado (ya neto de descuentos)')
  assert.equal(t.hoy.bruto, 160000, 'bruto = ventas + descuentos otorgados')
  assert.equal(t.hoy.descuentos, 10000)
  assert.equal(t.hoy.unidades, 3)
  assert.equal(t.hoy.aov, 75000)
  assert.equal(t.hoy.itemsPorPedido, 1.5)
  assert.equal(t.hoy.cobrado, 120000)
  assert.equal(t.hoy.pendiente, 30000)
  assert.equal(t.ayer.ventas, 80000)
})

test('desglosa top productos, vendedores, sucursales y medios de pago', () => {
  const ordenes = [
    orden('2026-09-20', 100000, [PAGO(60000, 'CASH'), PAGO(40000, 'CARD')], [{ productId: 'p1', description: 'iPhone', quantity: 1, unitPricePyg: 100000, totalPyg: 100000 }], { seller: { id: 'v1', name: 'Ana' }, branch: { id: 's1', name: 'Central' } }),
    orden('2026-09-20', 50000, [PAGO(50000, 'CASH')], [{ productId: 'p1', description: 'iPhone', quantity: 2, unitPricePyg: 25000, totalPyg: 50000 }], { seller: { id: 'v2', name: 'Beto' }, branch: { id: 's1', name: 'Central' } }),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19' })
  assert.equal(t.topProductos[0].nombre, 'iPhone')
  assert.equal(t.topProductos[0].unidades, 3)
  assert.equal(t.topProductos[0].ventas, 150000)
  assert.deepEqual(t.porVendedor.map((fila) => fila.etiqueta), ['Ana', 'Beto'])
  assert.deepEqual(t.porSucursal.map((fila) => [fila.etiqueta, fila.ventas]), [['Central', 150000]])
  assert.equal(t.pagos[0].clave, 'CASH')
  assert.equal(t.pagos[0].monto, 110000)
})

test('un pedido viejo no entra en el día y los pagos no confirmados no cobran', () => {
  const ordenes = [
    orden('2026-08-01', 90000, [PAGO(90000)], []),
    orden('2026-09-20', 30000, [{ status: 'PENDING', amountPyg: 30000, method: 'CASH' }], []),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19' })
  assert.equal(t.hoy.pedidos, 1)
  assert.equal(t.hoy.cobrado, 0)
  assert.equal(t.hoy.pendiente, 30000)
})

test('comparacion porcentual tolera el día sin ventas y el mismo día', () => {
  assert.equal(comparacion(150, 100), 50)
  assert.equal(comparacion(50, 100), -50)
  assert.equal(comparacion(0, 0), 0)
  assert.equal(comparacion(10, 0), 100)
})

test('diaDe lee createdAt, fecha y date', () => {
  assert.equal(diaDe('2026-09-20T23:30:00'), '2026-09-20')
  assert.equal(diaDe(''), '')
  assert.equal(diaDe(null), '')
  assert.equal(diaDe('no-es-fecha'), '')
})
