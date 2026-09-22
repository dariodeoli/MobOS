import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriaIcono, categoriaDeProducto } from './categoriaIcono.js'

test('categoriaIcono reconoce las familias del POS (#242)', () => {
  // iPhone y Watch ya tienen icono en la biblioteca; el resto cae a box hasta
  // que CMP sume los SVG (MacBook/iPad/AirPods/Accesorios).
  assert.equal(categoriaIcono({ categoria: 'iPhone' }), 'phone')
  assert.equal(categoriaIcono({ category: 'MacBook Pro' }), 'box')
  assert.equal(categoriaIcono({ categoria: 'iPad Air' }), 'box')
  assert.equal(categoriaIcono({ categoria: 'Apple Watch' }), 'clock')
  assert.equal(categoriaIcono({ categoria: 'AirPods' }), 'box')
  assert.equal(categoriaIcono({ categoria: 'Accesorios' }), 'box')
})

test('sin categoría cae al icono de accesorios y textos raros a box', () => {
  assert.equal(categoriaDeProducto({}), 'accesorios')
  assert.equal(categoriaIcono({ categoria: 'coso raro' }), 'box')
})
