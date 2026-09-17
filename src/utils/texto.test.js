import test from 'node:test'
import assert from 'node:assert/strict'
import { capitalizarPrimera } from './texto.js'

test('capitaliza la primera letra y respeta el resto', () => {
  assert.equal(capitalizarPrimera('avda. Mcal. López 123'), 'Avda. Mcal. López 123')
  assert.equal(capitalizarPrimera('nota del cliente'), 'Nota del cliente')
  assert.equal(capitalizarPrimera('YA mayúscula'), 'YA mayúscula')
})

test('no rompe con valores vacíos ni no textuales', () => {
  assert.equal(capitalizarPrimera(''), '')
  assert.equal(capitalizarPrimera(null), '')
  assert.equal(capitalizarPrimera(undefined), '')
  assert.equal(capitalizarPrimera('123 casa'), '123 casa')
})
