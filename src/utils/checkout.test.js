import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateCheckout } from './checkout.js'

test('split payments and discount are counted only once', () => {
  const lines = allocateCheckout([{ precio: 100000 }, { precio: 200000 }], 10000, 15000, [{ monto: 20000, cuenta: 'cash' }, { monto: 30000, cuenta: 'bank' }])
  assert.equal(lines.reduce((s, l) => s + l.total, 0), 305000)
  assert.equal(lines.flatMap(l => l.pagos).reduce((s, p) => s + p.monto, 0), 50000)
  assert.equal(lines.reduce((s, l) => s + l.descuento, 0), 10000)
})
test('payment spanning multiple products keeps exact total', () => {
  const lines = allocateCheckout([{ precio: 20000 }, { precio: 30000 }], 0, 0, [{ monto: 50000 }])
  assert.deepEqual(lines.map(l => l.pagos[0].monto), [20000, 30000])
})
test('reject overpayments and discounts above subtotal', () => {
  assert.throws(() => allocateCheckout([{ precio: 100 }], 0, 0, [{ monto: 101 }]))
  assert.throws(() => allocateCheckout([{ precio: 100 }], 101, 0, []))
})
