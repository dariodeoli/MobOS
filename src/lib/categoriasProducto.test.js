// #242: claves controladas e inferencia de categorías.
import test from 'node:test'
import assert from 'node:assert/strict'
const { CATEGORIAS_PRODUCTO, categoriaDe, categoriaMeta } = await import('./categoriasProducto.js')

test('respeta la clave controlada cuando ya está', () => {
  for (const clave of Object.keys(CATEGORIAS_PRODUCTO)) assert.equal(categoriaDe({ category: clave }), clave)
  assert.equal(categoriaDe({ category: 'iphone' }), 'IPHONE')
})

test('infiere del modelo o del nombre cuando falta', () => {
  assert.equal(categoriaDe({ category: 'Celulares' }), 'IPHONE')
  assert.equal(categoriaDe({ name: 'iPhone 15 Pro 256GB' }), 'IPHONE')
  assert.equal(categoriaDe({ name: 'MacBook Air M2' }), 'MACBOOK')
  assert.equal(categoriaDe({ name: 'iPad 10' }), 'IPAD')
  assert.equal(categoriaDe({ name: 'Apple Watch SE' }), 'WATCH')
  assert.equal(categoriaDe({ name: 'AirPods Pro 2' }), 'AIRPODS')
  assert.equal(categoriaDe({ name: 'Funda MagSafe' }), 'OTRO')
})

test('cada categoría tiene label e icono del objeto compartido', () => {
  for (const [clave, meta] of Object.entries(CATEGORIAS_PRODUCTO)) {
    assert.ok(meta.label, clave)
    assert.ok(meta.icon, clave)
  }
  assert.equal(categoriaMeta({ name: 'iPhone 15' }).icon, 'phone')
})
