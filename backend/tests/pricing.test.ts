import assert from 'node:assert/strict'
import test from 'node:test'
import { lineDiscount, PricingError, quoteTotals, resolveUnitPrice, unitPricePygFallback, warrantyDaysFor } from '../lib/pricing'

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

const producto = { id: 'p1', category: 'Audio', pricePyg: 100000, wholesalePricePyg: 80000, priceUsd: '25.50' }
const clienteMayorista = { pricingTier: 'WHOLESALE' }
const itemProducto = (extra = {}) => ({ scope: 'PRODUCT', productId: 'p1', tiers: [], ...extra })

test('resolución de precio: escalón > lista > mayorista > minorista > USD', () => {
  const lista = { items: [itemProducto({ unitPricePyg: 90000, tiers: [{ minQty: 3, unitPricePyg: 70000 }, { minQty: 6, unitPricePyg: 60000 }] })] }
  assert.equal(resolveUnitPrice({ product: producto, quantity: 2, customer: clienteMayorista, priceList: lista }).origin, 'LIST')
  const escalon = resolveUnitPrice({ product: producto, quantity: 3, customer: clienteMayorista, priceList: lista })
  assert.equal(escalon.origin, 'TIER')
  assert.equal(escalon.unitPricePyg, 70000)
  assert.equal(escalon.minQty, 3)
  const escalonMayor = resolveUnitPrice({ product: producto, quantity: 7, customer: clienteMayorista, priceList: lista })
  assert.equal(escalonMayor.unitPricePyg, 60000)
  assert.deepEqual(escalon.tiers, [{ minQty: 3, unitPricePyg: 70000 }, { minQty: 6, unitPricePyg: 60000 }])
})

test('descuento porcentual de lista sobre pricePyg y sin lista cae al mayorista', () => {
  const conDescuento = resolveUnitPrice({ product: producto, quantity: 1, customer: null, priceList: { items: [itemProducto({ discountPct: '10.00' })] } })
  assert.equal(conDescuento.origin, 'LIST')
  assert.equal(conDescuento.unitPricePyg, 90000)
  const mayorista = resolveUnitPrice({ product: producto, quantity: 1, customer: clienteMayorista })
  assert.equal(mayorista.origin, 'WHOLESALE')
  assert.equal(mayorista.unitPricePyg, 80000)
})

test('ítem de categoría aplica solo si no hay ítem del producto', () => {
  const lista = { items: [{ scope: 'CATEGORY', category: 'Audio', unitPricePyg: 85000, tiers: [] }] }
  assert.equal(resolveUnitPrice({ product: producto, quantity: 1, priceList: lista }).origin, 'LIST')
  const mixta = { items: [itemProducto({ unitPricePyg: 95000 }), { scope: 'CATEGORY', category: 'Audio', unitPricePyg: 85000, tiers: [] }] }
  assert.equal(resolveUnitPrice({ product: producto, quantity: 1, priceList: mixta }).unitPricePyg, 95000)
})

test('sin lista ni mayorista queda el minorista y el USD se marca aparte', () => {
  const minorista = resolveUnitPrice({ product: producto, quantity: 1 })
  assert.equal(minorista.origin, 'RETAIL')
  assert.equal(minorista.unitPricePyg, 100000)
  const soloUsd = resolveUnitPrice({ product: { id: 'p2', pricePyg: 0, wholesalePricePyg: null, priceUsd: 30 }, quantity: 1 })
  assert.equal(soloUsd.origin, 'USD')
  assert.equal(soloUsd.currency, 'USD')
  assert.equal(soloUsd.unitPricePyg, 0)
  assert.equal(soloUsd.unitPriceUsd, 30)
})

// #78: un dato de precio inválido es un error tipado (la ruta de pedidos lo
// mapea a 400 y muestra el mensaje, no un 409/500 genérico).
test('un dato de precio inválido lanza PricingError con mensaje claro', () => {
  assert.throws(
    () => resolveUnitPrice({ product: { id: 'p4', pricePyg: -1 }, quantity: 1 }),
    (cause: unknown) => cause instanceof PricingError && /Precio inválido/.test(cause.message),
  )
  assert.throws(
    () => unitPricePygFallback({ unitPricePyg: 0, origin: 'USD', currency: 'USD', tiers: [] }, 'no-es-numero'),
    PricingError,
  )
})

// #79: el fallback USD→retail tiene un solo dueño y también vale para un ítem
// de lista cotizado en USD sobre un producto con precio en guaraníes.
test('fallback USD a retail centralizado', () => {
  const minorista = resolveUnitPrice({ product: producto, quantity: 1 })
  assert.equal(unitPricePygFallback(minorista, producto.pricePyg), minorista.unitPricePyg, 'una resolución en PYG no toca el precio')
  const listaUsd = resolveUnitPrice({ product: producto, quantity: 1, priceList: { items: [itemProducto({ unitPriceUsd: '25.50' })] } })
  assert.equal(listaUsd.currency, 'USD')
  assert.equal(unitPricePygFallback(listaUsd, producto.pricePyg), 100000, 'un precio en USD cae al retail del producto')
  const soloUsd = resolveUnitPrice({ product: { id: 'p3', pricePyg: 0, wholesalePricePyg: null, priceUsd: 30 }, quantity: 1 })
  assert.equal(unitPricePygFallback(soloUsd, 0), 0, 'sin retail el fallback es cero, no un precio inventado')
  assert.throws(() => unitPricePygFallback({ ...soloUsd, currency: 'USD' }, 'no-es-numero'), PricingError)
})

console.log('pricing: 10 casos OK')

// #89: la categoría de la lista matchea sin importar mayúsculas ni acentos.
test('lista por categoría ignora mayúsculas y acentos', () => {
  const producto = { id: 'p1', category: 'Audio', pricePyg: 100000 }
  const conLista = (categoria: string) => resolveUnitPrice({
    product: producto,
    quantity: 1,
    customer: null,
    priceList: { items: [{ scope: 'CATEGORY', category: categoria, unitPricePyg: 80000, tiers: [] }] },
  })
  assert.equal(conLista('audio').unitPricePyg, 80000)
  assert.equal(conLista('AUDIO').origin, 'LIST')
  assert.equal(conLista('Audío').unitPricePyg, 80000)
  assert.equal(resolveUnitPrice({ product: producto, quantity: 1, customer: null, priceList: { items: [{ scope: 'CATEGORY', category: 'Audio', unitPricePyg: 80000, tiers: [] }] } }).unitPricePyg, 80000)
})
