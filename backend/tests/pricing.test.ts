import assert from 'node:assert/strict'
import test from 'node:test'
import { lineDiscount, PricingError, quoteTotals, warrantyDaysFor } from '../lib/pricing'

test('descuento fijo por línea', () => {
  const result = lineDiscount({ quantity: 2, unitPricePyg: 100000, discountPyg: 50000 })
  assert.equal(result.basePyg, 200000)
  assert.equal(result.discountPyg, 50000)
  assert.equal(result.totalPyg, 150000)
})

test('descuento porcentual redondea al guaraní', () => {
  const result = lineDiscount({ quantity: 1, unitPricePyg: 999999, discountPct: 10 })
  assert.equal(result.discountPyg, 100000)
  assert.equal(result.totalPyg, 899999)
})

test('no se permite combinar fijo y porcentual ni superar la línea', () => {
  assert.throws(() => lineDiscount({ quantity: 1, unitPricePyg: 1000, discountPyg: 100, discountPct: 5 }), PricingError)
  assert.throws(() => lineDiscount({ quantity: 1, unitPricePyg: 1000, discountPyg: 2000 }), PricingError)
  assert.throws(() => lineDiscount({ quantity: 1, unitPricePyg: 1000, discountPct: 150 }), PricingError)
})

test('garantía automática usa días del producto o el default por condición', () => {
  assert.equal(warrantyDaysFor({ condition: 'NEW', warrantyDays: null }), 365)
  assert.equal(warrantyDaysFor({ condition: 'USED', warrantyDays: null }), 90)
  assert.equal(warrantyDaysFor({ condition: 'USED', warrantyDays: 180 }), 180)
  assert.equal(warrantyDaysFor({ condition: 'NEW', warrantyDays: 900 }), 730)
})

test('totales de cotización con descuento y validaciones', () => {
  const totals = quoteTotals([{ quantity: 2, unitPricePyg: 800000 }, { quantity: 1, unitPricePyg: 100000 }], 50000)
  assert.equal(totals.subtotalPyg, 1700000)
  assert.equal(totals.totalPyg, 1650000)
  assert.throws(() => quoteTotals([], 0), PricingError)
  assert.throws(() => quoteTotals([{ quantity: 1, unitPricePyg: 1000 }], 5000), PricingError)
  assert.throws(() => quoteTotals([{ quantity: 0, unitPricePyg: 1000 }], 0), PricingError)
})

console.log('pricing: 5 casos OK')
