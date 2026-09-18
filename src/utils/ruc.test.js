import assert from 'node:assert/strict'
import test from 'node:test'
import { esRuc, extraerRuc } from './ruc.js'

test('extrae el RUC de un texto importado', () => {
  assert.equal(extraerRuc('Distribuidora Sur SA 80012345-6 Asunción'), '80012345-6')
})

test('extrae el RUC con puntos', () => {
  assert.equal(extraerRuc('RUC: 800.123.456-7'), '800.123.456-7')
})

test('sin RUC devuelve vacío', () => {
  assert.equal(extraerRuc('Cliente sin documento'), '')
  assert.equal(extraerRuc(''), '')
  assert.equal(extraerRuc(null), '')
})

test('esRuc acepta solo el patrón completo', () => {
  assert.equal(esRuc('80012345-6'), true)
  assert.equal(esRuc(' 800.123.456-7 '), true)
  assert.equal(esRuc('80012345'), false)
  assert.equal(esRuc('123456-'), false)
  assert.equal(esRuc(''), false)
})
