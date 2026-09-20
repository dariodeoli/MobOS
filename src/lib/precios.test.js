import assert from 'node:assert/strict'
import test from 'node:test'
import { resolverPrecio } from './precios.js'

// Espejo de backend/tests/pricing.test.ts: mismas reglas de prioridad.
const producto = { id: 'p1', category: 'Celulares', pricePyg: 100000, wholesalePricePyg: 80000, priceUsd: '200.00' }
const lista10 = { id: 'l1', items: [{ productId: 'p1', adjustment: 'DISCOUNT', valuePct: '10.00' }] }
const escalones = [{ minQuantity: 3, unitPricePyg: 90000 }, { minQuantity: 10, unitPricePyg: 75000 }]

test('escalón por cantidad gana sobre la lista, el mayorista y el minorista', () => {
  const conTodo = { quantity: 3, product: producto, tiers: escalones, priceList: lista10, customerPricingTier: 'WHOLESALE' }
  assert.equal(resolverPrecio(conTodo).unitPricePyg, 90000)
  assert.equal(resolverPrecio(conTodo).source, 'TIER')
  assert.equal(resolverPrecio({ ...conTodo, quantity: 9 }).unitPricePyg, 90000)
  assert.equal(resolverPrecio({ ...conTodo, quantity: 10 }).unitPricePyg, 75000)
  assert.equal(resolverPrecio({ ...conTodo, quantity: 2 }).unitPricePyg, 72000)
  assert.equal(resolverPrecio({ ...conTodo, quantity: 2 }).source, 'LIST')
})

test('lista del cliente gana sobre mayorista y minorista', () => {
  assert.equal(resolverPrecio({ quantity: 1, product: producto, priceList: lista10 }).unitPricePyg, 90000)
  const mayorista = resolverPrecio({ quantity: 1, product: producto, priceList: lista10, customerPricingTier: 'WHOLESALE' })
  assert.equal(mayorista.unitPricePyg, 72000)
  assert.equal(mayorista.priceListId, 'l1')
})

test('el ítem por producto gana sobre el de categoría y el recargo suma', () => {
  const lista = { id: 'l2', items: [
    { category: 'Celulares', adjustment: 'DISCOUNT', valuePct: 30 },
    { productId: 'p1', adjustment: 'SURCHARGE', valuePct: 5 },
  ] }
  assert.equal(resolverPrecio({ quantity: 1, product: producto, priceList: lista }).unitPricePyg, 105000)
  assert.equal(resolverPrecio({ quantity: 1, product: { ...producto, id: 'p9' }, priceList: lista }).unitPricePyg, 70000)
})

test('sin ítem que cubra cae al precio del tramo; sin mayorista cae al minorista', () => {
  const lista = { id: 'l3', items: [{ category: 'Tablets', adjustment: 'DISCOUNT', valuePct: 50 }] }
  assert.equal(resolverPrecio({ quantity: 1, product: producto, priceList: lista }).unitPricePyg, 100000)
  assert.equal(resolverPrecio({ quantity: 1, product: producto, priceList: lista, customerPricingTier: 'WHOLESALE' }).unitPricePyg, 80000)
  const sinMayorista = { ...producto, wholesalePricePyg: null }
  assert.equal(resolverPrecio({ quantity: 1, product: sinMayorista, customerPricingTier: 'WHOLESALE' }).unitPricePyg, 100000)
})

test('precio en USD: último recurso y se convierte solo con cotización', () => {
  const soloUsd = { id: 'p2', category: 'Celulares', pricePyg: 0, wholesalePricePyg: null, priceUsd: '150.00' }
  assert.equal(resolverPrecio({ quantity: 1, product: soloUsd }).source, 'USD')
  assert.equal(resolverPrecio({ quantity: 1, product: soloUsd }).unitPricePyg, 0)
  assert.equal(resolverPrecio({ quantity: 1, product: soloUsd, usdRatePyg: 7500 }).unitPricePyg, 1125000)
  assert.equal(resolverPrecio({ quantity: 1, product: soloUsd, usdRatePyg: 7500, priceList: { id: 'l4', items: [{ productId: 'p2', adjustment: 'DISCOUNT', valuePct: 10 }] } }).unitPricePyg, 1012500)
})

test('bordes: cantidad inválida, porcentaje fuera de rango y descuento total', () => {
  assert.equal(resolverPrecio({ quantity: 0, product: producto }).unitPricePyg, 100000)
  assert.equal(resolverPrecio({ quantity: Number.NaN, product: producto }).unitPricePyg, 100000)
  assert.equal(resolverPrecio({ quantity: -5, product: producto }).unitPricePyg, 100000)
  assert.throws(() => resolverPrecio({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 150 }] } }))
  assert.throws(() => resolverPrecio({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 'x' }] } }))
  assert.equal(resolverPrecio({ quantity: 1, product: producto, priceList: { items: [{ productId: 'p1', valuePct: 100 }] } }).unitPricePyg, 0)
})

console.log('precios: 6 casos OK')
