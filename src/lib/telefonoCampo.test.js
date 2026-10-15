import test from 'node:test'
import assert from 'node:assert/strict'
import { sinCeroLocal } from './telefonoCampo.js'

// La composición y la lectura envuelven a la biblioteca (JSX): acá se prueba la
// regla propia, que es quitar el 0 de marcado local.
test('sinCeroLocal quita el 0 de marcado local y nada más', () => {
  assert.equal(sinCeroLocal('0983 123 456'), '983 123 456')
  assert.equal(sinCeroLocal('  0983123456'), '983123456')
  assert.equal(sinCeroLocal('983123456'), '983123456')
  assert.equal(sinCeroLocal('00983 123'), '983 123')
  assert.equal(sinCeroLocal('0'), '0')
  assert.equal(sinCeroLocal(''), '')
  assert.equal(sinCeroLocal(undefined), '')
  assert.equal(sinCeroLocal('21 000 000'), '21 000 000')
})
