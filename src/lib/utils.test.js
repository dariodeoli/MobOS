import assert from 'node:assert/strict'
import test from 'node:test'
import { primerNombre } from './utils.js'

test('el primer nombre es la primera palabra', () => {
  assert.equal(primerNombre('Dario De Oliveira'), 'Dario')
  assert.equal(primerNombre('  Sol  Giménez '), 'Sol')
  assert.equal(primerNombre('Sol'), 'Sol')
})

test('sin nombre devuelve vacío', () => {
  assert.equal(primerNombre(''), '')
  assert.equal(primerNombre('   '), '')
  assert.equal(primerNombre(null), '')
})
