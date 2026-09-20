import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePriceListItems } from '../lib/price-lists'

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
