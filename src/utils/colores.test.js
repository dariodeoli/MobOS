import assert from 'node:assert/strict'
import test from 'node:test'
import { agruparProductos, separarColor } from './colores.js'

test('reconoce acabados en español al final del nombre', () => {
  assert.deepEqual(separarColor('iPhone 15 Pro 256GB Titanio'), { base: 'iPhone 15 Pro 256GB', color: 'Titanio' })
  assert.deepEqual(separarColor('iPhone 15 Pro 256GB Negro'), { base: 'iPhone 15 Pro 256GB', color: 'Negro' })
})

test('agrupa variantes por modelo y capacidad', () => {
  const grupos = agruparProductos([
    { id: 'a', nombre: 'iPhone 15 Pro 256GB Titanio' },
    { id: 'b', nombre: 'iPhone 15 Pro 256GB Negro' },
    { id: 'c', nombre: 'iPhone 15 Pro 512GB Titanio' },
  ])
  assert.equal(grupos.length, 2)
  assert.deepEqual(grupos[0].items.map((item) => item.color), ['Titanio', 'Negro'])
  assert.equal(grupos[1].base, 'iPhone 15 Pro 512GB')
})
