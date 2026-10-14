import test from 'node:test'
import assert from 'node:assert/strict'
import { limpiarCodigo, formatearCodigo, insertarEnCodigo, celdasDeCodigo, estadoCodigo, imeiValido, largoCodigo } from './codigoSegmentado.js'

test('pegar el código completo de vinculación llena los 10 segmentos', () => {
  const limpio = limpiarCodigo('abcde-fghij ', 'letras')
  assert.equal(limpio, 'ABCDEFGHIJ')
  const valor = insertarEnCodigo('', 0, limpio, largoCodigo([5, 5]))
  assert.deepEqual(celdasDeCodigo(valor, [5, 5]), 'ABCDEFGHIJ'.split(''))
  assert.equal(formatearCodigo(valor, [5, 5]), 'ABCDE-FGHIJ')
})

test('gift card: el prefijo GC pegado no consume segmentos y O/I/L se normalizan', () => {
  const limpio = limpiarCodigo('gc-ab0o-1ilz-9x8y', 'crockford', 'GC')
  assert.equal(limpio, 'AB00' + '1' + '11Z' + '9X8Y'.slice(0, 4))
  assert.equal(limpio.length, 12)
  assert.equal(formatearCodigo(limpio, [4, 4, 4], '-', 'GC'), 'GC-AB00-111Z-9X8Y')
})

test('el pegado en medio reemplaza lo que sigue y respeta el largo', () => {
  assert.equal(insertarEnCodigo('AB', 2, 'CDEFGHIJKLMN', 10), 'ABCDEFGHIJ')
})

test('estado: vacío, incompleto, inválido y completo', () => {
  assert.equal(estadoCodigo('', [5, 5]), 'vacio')
  assert.equal(estadoCodigo('ABC', [5, 5]), 'incompleto')
  assert.equal(estadoCodigo('ABCDEFGHIJ', [5, 5], () => false), 'invalido')
  assert.equal(estadoCodigo('ABCDEFGHIJ', [5, 5], () => true), 'completo')
})

test('IMEI: pegado con espacios y validación Luhn', () => {
  const limpio = limpiarCodigo('49-015420-323751-8', 'numerico')
  assert.equal(limpio, '490154203237518')
  assert.equal(imeiValido(limpio), true)
  assert.equal(imeiValido('490154203237519'), false)
  assert.equal(imeiValido('123'), false)
})
