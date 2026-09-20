import assert from 'node:assert/strict'
import test from 'node:test'
import { lineDiscount, PricingError, quoteTotals, resolvePrice, warrantyDaysFor } from '../lib/pricing'

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

// ── Resolución del precio por prioridad ────────────────────────────────────
const producto = { id: 'p1', category: 'Celulares', pricePyg: 100000, wholesalePricePyg: 80000, priceUsd: '200.00' }
const lista10 = { id: 'l1', items: [{ productId: 'p1', adjustment: 'DISCOUNT', valuePct: '10.00' }] }
const escalones = [{ minQuantity: 3, unitPricePyg: 90000 }, { minQuantity: 10, unitPricePyg: 75000 }]

test('escalón por cantidad gana sobre la lista, el mayorista y el minorista', () => {
  const conTodo = { quantity: 3, product: producto, tiers: escalones, priceList: lista10, customerPricingTier: 'WHOLESALE' }
  assert.deepEqual(resolvePrice(conTodo), { unitPricePyg: 90000, source: 'TIER', tierMinQuantity: 3, priceListId: null, priceUsd: 200, usdRatePyg: null })
  // El tramo más alto alcanzado manda: 9 unidades siguen en 90000, 10 pasan a 75000.
  assert.equal(resolvePrice({ ...conTodo, quantity: 9 }).unitPricePyg, 90000)
  assert.equal(resolvePrice({ ...conTodo, quantity: 10 }).unitPricePyg, 75000)
  // Borde: por debajo del primer escalón no aplica (2 unidades → lista del cliente).
  assert.equal(resolvePrice({ ...conTodo, quantity: 2 }).unitPricePyg, 72000)
  assert.equal(resolvePrice({ ...conTodo, quantity: 2 }).source, 'LIST')
})

test('lista del cliente gana sobre mayorista y minorista', () => {
  assert.equal(resolvePrice({ quantity: 1, product: producto, priceList: lista10 }).unitPricePyg, 90000)
  const listaSobreMayorista = resolvePrice({ quantity: 1, product: producto, priceList: lista10, customerPricingTier: 'WHOLESALE' })
  assert.equal(listaSobreMayorista.unitPricePyg, 72000)
  assert.equal(listaSobreMayorista.source, 'LIST')
  assert.equal(listaSobreMayorista.priceListId, 'l1')
})

test('el ítem por producto gana sobre el de categoría y el recargo suma', () => {
  const lista = { id: 'l2', items: [
    { category: 'Celulares', adjustment: 'DISCOUNT', valuePct: 30 },
    { productId: 'p1', adjustment: 'SURCHARGE', valuePct: 5 },
  ] }
  const recargo = resolvePrice({ quantity: 1, product: producto, priceList: lista })
  assert.equal(recargo.unitPricePyg, 105000)
  assert.equal(recargo.source, 'LIST')
  // Un producto sin ítem propio usa el de su categoría.
  assert.equal(resolvePrice({ quantity: 1, product: { ...producto, id: 'p9' }, priceList: lista }).unitPricePyg, 70000)
})

test('lista sin ítem que cubra el producto cae al precio del tramo del cliente', () => {
  const lista = { id: 'l3', items: [{ category: 'Tablets', adjustment: 'DISCOUNT', valuePct: 50 }] }
  assert.equal(resolvePrice({ quantity: 1, product: producto, priceList: lista }).unitPricePyg, 100000)
  assert.equal(resolvePrice({ quantity: 1, product: producto, priceList: lista, customerPricingTier: 'WHOLESALE' }).unitPricePyg, 80000)
})

test('mayorista solo si el producto tiene precio mayorista; sin él cae al minorista', () => {
  const sinMayorista = { ...producto, wholesalePricePyg: null }
  assert.equal(resolvePrice({ quantity: 1, product: sinMayorista, customerPricingTier: 'WHOLESALE' }).unitPricePyg, 100000)
  assert.equal(resolvePrice({ quantity: 1, product: sinMayorista, customerPricingTier: 'WHOLESALE' }).source, 'RETAIL')
  assert.equal(resolvePrice({ quantity: 1, product: producto }).source, 'RETAIL')
  assert.equal(resolvePrice({ quantity: 1, product: producto }).unitPricePyg, 100000)
})

test('precio en USD: último recurso y se convierte solo con cotización', () => {
  const soloUsd = { id: 'p2', category: 'Celulares', pricePyg: 0, wholesalePricePyg: null, priceUsd: '150.00' }
  const sinRate = resolvePrice({ quantity: 1, product: soloUsd })
  assert.equal(sinRate.source, 'USD')
  assert.equal(sinRate.unitPricePyg, 0)
  assert.equal(sinRate.priceUsd, 150)
  const conRate = resolvePrice({ quantity: 1, product: soloUsd, usdRatePyg: 7500 })
  assert.equal(conRate.unitPricePyg, 1125000)
  assert.equal(conRate.source, 'USD')
  // Con cotización, la lista también puede ajustar el precio en dólares.
  const conLista = resolvePrice({ quantity: 1, product: soloUsd, usdRatePyg: 7500, priceList: { id: 'l4', items: [{ productId: 'p2', adjustment: 'DISCOUNT', valuePct: 10 }] } })
  assert.equal(conLista.unitPricePyg, 1012500)
})

test('bordes del resolvedor: cantidad inválida y porcentaje fuera de rango', () => {
  assert.equal(resolvePrice({ quantity: 0, product: producto }).unitPricePyg, 100000)
  assert.equal(resolvePrice({ quantity: Number.NaN, product: producto }).unitPricePyg, 100000)
  assert.equal(resolvePrice({ quantity: -5, product: producto }).unitPricePyg, 100000)
  assert.throws(() => resolvePrice({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 150 }] } }), PricingError)
  assert.throws(() => resolvePrice({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 'x' }] } }), PricingError)
  // Descuento total: la lista deja el producto en 0 (no revienta la venta).
  assert.equal(resolvePrice({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 100 }] } }).unitPricePyg, 0)
})

console.log('pricing: 12 casos OK')
