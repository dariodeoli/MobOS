import assert from 'node:assert/strict'
import test from 'node:test'
import { MONEDAS_FIJAS, errorDeMoneda, monedasExcluidas } from './paymentAccountsReglas.js'

// #142/#204: cada medio tiene su moneda y la transferencia no mezcla USDT.

test('cada medio fija su moneda o valida la elegida', () => {
  assert.deepEqual(MONEDAS_FIJAS, { PIX: 'BRL', CRYPTO: 'USD' })
  assert.equal(errorDeMoneda('PIX', 'BRL'), '')
  assert.match(errorDeMoneda('PIX', 'PYG'), /reales/)
  assert.equal(errorDeMoneda('CRYPTO', 'USD'), '')
  assert.match(errorDeMoneda('CRYPTO', 'BRL'), /dólares/)
  assert.equal(errorDeMoneda('CASH', 'USDT'), '')
  assert.equal(errorDeMoneda('TRANSFER', 'PYG'), '')
  assert.equal(errorDeMoneda('TRANSFER', 'USD'), '')
})

test('la transferencia no ofrece ni acepta USDT', () => {
  assert.match(errorDeMoneda('TRANSFER', 'USDT'), /propio medio/)
  assert.deepEqual(monedasExcluidas('TRANSFER'), ['USDT'])
  assert.deepEqual(monedasExcluidas('CASH'), [])
  assert.deepEqual(monedasExcluidas('CARD'), [])
  assert.deepEqual(monedasExcluidas('CRYPTO'), [])
})
