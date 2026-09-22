import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriaIcono, categoriaDeProducto } from './categoriaIcono.js'

test('categoriaIcono reconoce las familias del POS (#242)', () => {
  assert.notEqual(categoriaIcono({ categoria: 'iPhone' }), 'box')
  assert.notEqual(categoriaIcono({ category: 'MacBook Pro' }), 'box')
  assert.notEqual(categoriaIcono({ categoria: 'iPad Air' }), 'box')
  assert.notEqual(categoriaIcono({ categoria: 'Apple Watch' }), 'box')
  assert.notEqual(categoriaIcono({ categoria: 'AirPods' }), 'box')
  assert.notEqual(categoriaIcono({ categoria: 'Accesorios' }), 'box')
})

test('sin categoría cae al icono de accesorios y textos raros a box', () => {
  assert.equal(categoriaDeProducto({}), 'accesorios')
  assert.equal(categoriaIcono({ categoria: 'coso raro' }), 'box')
})
