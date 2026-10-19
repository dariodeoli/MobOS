import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparCatalogoInventario,
  disponibilidadCatalogo,
  esProductoApple,
  filaCatalogoInventario,
  modoCatalogo,
  varianteApple,
} from './appleInventory.js'

test('reconoce Apple aunque la marca esté implícita en el nombre', () => {
  assert.equal(esProductoApple({ name: 'iPhone 15 Pro 256GB Titanio' }), true)
  assert.equal(modoCatalogo({ name: 'Cable USB Lightning', category: 'Accesorios' }), 'generic')
})

test('normaliza la variante Apple desde atributos o nombre', () => {
  assert.deepEqual(varianteApple({ name: 'iPhone 15 Pro 256GB Titanio' }), {
    model: 'iPhone 15 Pro 256GB Titanio', capacity: '256GB', color: '', condition: '', key: 'iPhone 15 Pro 256GB Titanio · 256GB',
  })
  assert.equal(varianteApple({ model: 'iPhone 15 Pro', capacity: '256 GB', color: 'Negro', condition: 'NEW' }).key, 'iPhone 15 Pro · 256 GB · Negro · NEW')
})

test('no inventa disponibilidad y cuenta unidades disponibles', () => {
  const product = { id: 'p1', name: 'iPhone 15', stock: undefined }
  assert.equal(disponibilidadCatalogo(product), null)
  assert.equal(disponibilidadCatalogo(product, [
    { productId: 'p1', status: 'AVAILABLE' },
    { productId: 'p1', status: 'SOLD' },
    { productId: 'p2', status: 'AVAILABLE' },
  ]), 1)
})

test('fila diferencia Apple serializado y producto genérico por cantidad', () => {
  const apple = filaCatalogoInventario({ id: 'p1', name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB', color: 'Azul' }, [{ productId: 'p1', status: 'AVAILABLE' }])
  const generic = filaCatalogoInventario({ id: 'p2', sku: 'CAB-1', name: 'Cable USB', stock: 4 })
  assert.equal(apple.mode, 'apple')
  assert.equal(apple.imeiRequired, true)
  assert.equal(apple.availability, 1)
  assert.equal(generic.mode, 'generic')
  assert.equal(generic.imeiRequired, false)
  assert.equal(generic.availability, 4)
})

test('agrupa sólo filas con la misma clave de variante', () => {
  const grouped = agruparCatalogoInventario([
    { id: 'a', name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB', color: 'Azul', stock: 1 },
    { id: 'b', name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB', color: 'Azul', stock: 2 },
    { id: 'c', name: 'Cable USB', sku: 'C1', stock: 5 },
  ])
  assert.equal(grouped.size, 2)
  assert.equal([...grouped.values()].find((row) => row.sku === 'C1').availability, 5)
})

