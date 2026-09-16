import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizarTelefono, telefonoValido } from './telefono.js'

test('acepta móviles paraguayos en formatos comunes', () => {
  assert.equal(telefonoValido('0981 123 456'), true)
  assert.equal(telefonoValido('+595 971 234567'), true)
  assert.equal(telefonoValido('595981234567'), true)
  assert.equal(telefonoValido('0981123456'), true)
})

test('rechaza líneas fijas y números cortos para Paraguay', () => {
  assert.equal(telefonoValido('021 123 456'), false)
  assert.equal(telefonoValido('0981 123'), false)
  assert.equal(telefonoValido('abc'), false)
  assert.equal(telefonoValido(''), false)
})

test('otros países exigen entre 6 y 12 dígitos', () => {
  assert.equal(telefonoValido('5511999999999', '+55'), true)
  assert.equal(telefonoValido('+54 11 1234 5678', '+54'), true)
  assert.equal(telefonoValido('12345', '+1'), false)
  assert.equal(telefonoValido('12345678901234', '+1'), false)
})

test('normaliza espacios, guiones y paréntesis', () => {
  assert.equal(normalizarTelefono('+595 (971) 234-567'), '+595971234567')
})
