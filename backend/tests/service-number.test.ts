import assert from 'node:assert/strict'
import test from 'node:test'
import { formatServiceNumber } from '../lib/service-number'

test('el número de orden de servicio usa el prefijo OS y cuatro dígitos', () => {
  assert.equal(formatServiceNumber(1), 'OS-#0001')
  assert.equal(formatServiceNumber(42), 'OS-#0042')
  assert.equal(formatServiceNumber(12345), 'OS-#12345')
})
