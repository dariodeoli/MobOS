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

test('el período agrupa los desgloses y suma los cobros por cuenta', () => {
  const ordenes = [
    orden('2026-09-20', 100000, [{ status: 'CONFIRMED', amountPyg: 100000, method: 'CASH', accountSnapshot: { id: 'a1', name: 'Caja Central' } }], [{ productId: 'p1', description: 'iPhone', quantity: 1, unitPricePyg: 100000, totalPyg: 100000 }]),
    orden('2026-09-18', 50000, [{ status: 'CONFIRMED', amountPyg: 50000, method: 'TRANSFER', accountSnapshot: { id: 'a2', name: 'Ueno' } }], [{ productId: 'p2', description: 'Funda', quantity: 1, unitPricePyg: 50000, totalPyg: 50000 }]),
    orden('2026-08-01', 90000, [{ status: 'CONFIRMED', amountPyg: 90000, method: 'CASH' }], []),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19', desde: '2026-09-14' })
  assert.equal(t.hoy.ventas, 100000, 'el encabezado sigue siendo de hoy')
  assert.equal(t.periodo.pedidos, 2, 'el período suma los últimos 7 días')
  assert.equal(t.topProductos.length, 2)
  assert.deepEqual(t.pagosPorCuenta.map((fila) => [fila.etiqueta, fila.monto]), [['Caja Central', 100000], ['Ueno', 50000]])
})

test('#148 §18: cobros netos por tipo, efectivo y pagos por sucursal', () => {
  const ordenes = [
    orden('2026-09-20', 100000, [
      PAGO(60000, 'CASH'),
      PAGO(30000, 'PIX'),
      { status: 'REFUNDED', amountPyg: 10000, method: 'PIX' },
    ], [{ productId: 'p1', description: 'iPhone', quantity: 1, unitPricePyg: 100000, totalPyg: 100000 }], { branch: { id: 's1', name: 'Central' } }),
    orden('2026-09-20', 50000, [
      PAGO(50000, 'CASH'),
      { status: 'REFUNDED', amountPyg: 5000, method: 'CASH' },
    ], [{ productId: 'p2', description: 'Funda', quantity: 1, unitPricePyg: 50000, totalPyg: 50000 }], { branch: { id: 's2', name: 'Villa Morra' } }),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19' })
  assert.equal(t.hoy.efectivo, 105000, 'efectivo = cobros CASH − reembolsos CASH')
  assert.equal(t.hoy.reembolsado, 15000)
  const pix = t.pagos.find((fila) => fila.clave === 'PIX')
  assert.equal(pix.monto, 30000, 'el reembolsado no suma cobro')
  assert.equal(pix.reembolsado, 10000)
  assert.equal(pix.neto, 20000, 'neto = cobrado − reembolsado')
  assert.equal(t.pagos.find((fila) => fila.clave === 'CASH').neto, 105000)
  assert.deepEqual(t.pagosPorSucursal.map((fila) => [fila.etiqueta, fila.neto]), [['Central', 80000], ['Villa Morra', 45000]])
})

test('#148 §18: gift cards no existen; el equivalente (saldo a favor y canje) va con nombre humano', () => {
  // El producto no tiene gift cards: el corte por tipo desglosa el saldo a
  // favor (STORE_CREDIT) y el canje (TRADE_IN) con su etiqueta, no con el código.
  const ordenes = [
    orden('2026-09-20', 120000, [
      PAGO(70000, 'STORE_CREDIT'),
      PAGO(50000, 'TRADE_IN'),
    ], [{ productId: 'p1', description: 'iPhone', quantity: 1, unitPricePyg: 120000, totalPyg: 120000 }]),
  ]
  const t = tableroPos(ordenes, { hoy: '2026-09-20', ayer: '2026-09-19' })
  const saldo = t.pagos.find((fila) => fila.clave === 'STORE_CREDIT')
  const canje = t.pagos.find((fila) => fila.clave === 'TRADE_IN')
  assert.equal(saldo?.etiqueta, 'Saldo a favor')
  assert.equal(saldo?.neto, 70000)
  assert.equal(canje?.etiqueta, 'Canje')
  assert.equal(canje?.neto, 50000)
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
