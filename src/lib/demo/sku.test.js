import test from 'node:test'
import assert from 'node:assert/strict'
import { skuDemo } from './sku.js'

test('el SKU demo se deriva del id: mayúsculas, sin símbolos y hasta 24 caracteres', () => {
  assert.equal(skuDemo('demo-funda-magsafe-transparente'), 'DEMO-FUNDA-MAGSAFE-TRANS')
  assert.equal(skuDemo('demo-iphone-15-pro-256-titanio'), 'DEMO-IPHONE-15-PRO-256-T')
  assert.equal(skuDemo('IP15PM-256-NAT'), 'IP15PM-256-NAT')
})

test('un id vacío no rompe la derivación', () => {
  assert.equal(skuDemo(''), '')
  assert.equal(skuDemo(undefined), '')
})
