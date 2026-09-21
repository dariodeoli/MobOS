import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analiticaDePedidos, statsDePedidos } from './customerAggregates.js'

const pedido = (numero, total, dias, { estado = 'COMPLETED', items = [] } = {}) => ({
  orderNumber: numero,
  totalPyg: total,
  status: estado,
  createdAt: new Date(Date.now() - dias * 86400000).toISOString(),
  items,
})

test('stats del listado: cuenta, total y última compra sin cancelados', () => {
  const stats = statsDePedidos([
    pedido('MOB-0001', 1000000, 10),
    pedido('MOB-0002', 500000, 5),
    pedido('MOB-0003', 900000, 2, { estado: 'CANCELLED' }),
  ])
  assert.equal(stats.orders, 2)
  assert.equal(stats.totalSpentPyg, 1500000)
  assert.equal(new Date(stats.lastOrderAt).getTime() > new Date(statsDePedidos([pedido('X', 1, 10)]).lastOrderAt).getTime(), true)
  assert.deepEqual(statsDePedidos([]), { orders: 0, totalSpentPyg: 0, lastOrderAt: null })
})

test('analítica: ticket promedio, primera/última compra y frecuencia', () => {
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
  const analitica = analiticaDePedidos([
    pedido('MOB-0001', 3000000, 12),
    pedido('MOB-0002', 1800000, 42),
    pedido('MOB-0003', 900000, 72),
  ], { customerSince: hace(100), ahora: new Date() })
  assert.equal(analitica.ordersCount, 3)
  assert.equal(analitica.totalPyg, 5700000)
  assert.equal(analitica.avgTicketPyg, 1900000)
  assert.equal(Math.round((new Date(analitica.lastPurchaseAt) - new Date(analitica.firstPurchaseAt)) / 86400000), 60)
  assert.equal(analitica.frequencyDays, 30)
  assert.equal(analitica.antiguedadDias, 100)
  assert.equal(analitica.spendPerMonthPyg, Math.round(5700000 / ((Date.now() - new Date(analitica.firstPurchaseAt).getTime()) / (30 * 86400000))))
})

test('analítica: favoritos por producto, modelo y categoría, y meses/días', () => {
  const analitica = analiticaDePedidos([
    pedido('MOB-0001', 3000000, 40, { items: [{ description: 'iPhone 15 · 128 GB', quantity: 1, totalPyg: 3000000, model: 'iPhone 15', category: 'Celulares' }] }),
    pedido('MOB-0002', 1800000, 20, { items: [{ description: 'Apple Watch SE', quantity: 1, totalPyg: 1800000, model: 'Apple Watch SE', category: 'Apple Watch' }] }),
    pedido('MOB-0003', 1200000, 10, { items: [{ description: 'iPad 10 · 64 GB', quantity: 1, totalPyg: 1200000, model: 'iPad 10', category: 'Celulares' }] }),
  ], { customerSince: new Date(Date.now() - 60 * 86400000).toISOString() })
  assert.deepEqual(analitica.topProducts.map((item) => item.description), ['iPhone 15 · 128 GB', 'Apple Watch SE', 'iPad 10 · 64 GB'])
  assert.deepEqual(analitica.topModels.map((item) => item.model), ['iPhone 15', 'Apple Watch SE', 'iPad 10'])
  assert.deepEqual(analitica.topCategories.map((item) => item.category), ['Celulares', 'Apple Watch'])
  assert.equal(analitica.topCategories[0].totalPyg, 4200000)
  assert.equal(analitica.byMonth.length, 2) // dos meses distintos
  assert.equal(analitica.topMonths.length, 2)
  assert.ok(analitica.topWeekdays.length >= 1)
  assert.equal(analitica.statement[0].orderNumber, 'MOB-0003')
})

test('analítica vacía no rompe', () => {
  const vacia = analiticaDePedidos([], { customerSince: null })
  assert.equal(vacia.ordersCount, 0)
  assert.equal(vacia.avgTicketPyg, 0)
  assert.equal(vacia.frequencyDays, null)
  assert.deepEqual(vacia.topProducts, [])
  assert.deepEqual(vacia.statement, [])
})
