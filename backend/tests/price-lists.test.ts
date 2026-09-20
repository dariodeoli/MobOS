import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePriceListItems } from '../lib/price-lists'
import { resolveUnitPrice } from '../lib/pricing'

test('items null o ausente no cambia la lista', () => {
  assert.equal(parsePriceListItems(undefined), undefined)
  assert.equal(parsePriceListItems(null), undefined)
  assert.deepEqual(parsePriceListItems([]), [])
})

test('categorías equivalentes no se pueden repetir (mayúsculas/acentos)', () => {
  assert.throws(() => parsePriceListItems([
    { scope: 'CATEGORY', category: 'Audio', unitPricePyg: 1000 },
    { scope: 'CATEGORY', category: 'audío', unitPricePyg: 2000 },
  ]))
})

test('cantidad por debajo del primer escalón cae al precio fijo del ítem', () => {
  const priceList = { items: [{ scope: 'CATEGORY', category: 'Audio', unitPricePyg: 90000, tiers: [{ minQty: 5, unitPricePyg: 80000 }] }] }
  // La categoría del producto va en minúsculas a propósito: el match es insensible.
  const pocas = resolveUnitPrice({ product: { category: 'audio', pricePyg: 100000 }, quantity: 1, priceList })
  assert.equal(pocas.origin, 'LIST')
  assert.equal(pocas.unitPricePyg, 90000)

  const alcanza = resolveUnitPrice({ product: { category: 'audio', pricePyg: 100000 }, quantity: 5, priceList })
  assert.equal(alcanza.origin, 'TIER')
  assert.equal(alcanza.unitPricePyg, 80000)
})
