// #250: catálogo de variantes para el buscador dependiente (modelo → capacidad → color).
import test from 'node:test'
import assert from 'node:assert/strict'
const { capacidadesDeModelo, coloresDeVariante, modelosDeCatalogo, skuDeVariante, varianteExistente } = await import('./catalog.js')

const productos = [
  { id: 'p1', name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB', color: 'Negro' },
  { id: 'p2', name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB', color: 'Azul' },
  { id: 'p3', name: 'iPhone 15', model: 'iPhone 15', capacity: '256GB', color: 'Negro' },
  { id: 'p4', name: 'Cable USB-C', model: '', capacity: '', color: '' },
]

test('las capacidades dependen del modelo: lineup + lo ya cargado', () => {
  const capacidades = capacidadesDeModelo({ productos, modelo: 'iPhone 15' })
  assert.ok(capacidades.includes('128GB'))
  assert.ok(capacidades.includes('256GB'))
  assert.deepEqual(capacidadesDeModelo({ productos, modelo: 'iPhone 99' }), [])
  assert.deepEqual(capacidadesDeModelo({ productos, modelo: '' }), [])
  // El lineup seminuevo trae más capacidades para el mismo modelo.
  const seminuevo = capacidadesDeModelo({ productos: [], modelo: 'iPhone 15', condicion: 'USED' })
  assert.ok(seminuevo.length >= capacidadesDeModelo({ productos: [], modelo: 'iPhone 15', condicion: 'NEW' }).length)
  assert.deepEqual(capacidadesDeModelo({ productos: [], modelo: 'iPhone 15 Pro Max' }).slice(0, 2), ['128GB', '256GB'])
})

test('los modelos sugeridos salen del lineup y del catálogo real', () => {
  const modelos = modelosDeCatalogo(productos)
  assert.equal(modelos[0], 'iPhone 17 Pro Max', 'el lineup manda el orden por generación')
  assert.ok(modelos.includes('Cable USB-C'), 'lo cargado a mano también se sugiere')
  assert.equal(new Set(modelos.map(m => m.toLowerCase())).size, modelos.length, 'sin repetidos')
})

test('los colores dependen de la variante (modelo + capacidad)', () => {
  assert.deepEqual(coloresDeVariante({ productos, modelo: 'iPhone 15', capacidad: '128GB' }), ['Azul', 'Negro'])
  assert.deepEqual(coloresDeVariante({ productos, modelo: 'iPhone 15', capacidad: '256GB' }), ['Negro'])
  assert.deepEqual(coloresDeVariante({ productos, modelo: 'iPhone 15' }), ['Azul', 'Negro'])
  assert.deepEqual(coloresDeVariante({ productos, modelo: 'Cable USB-C' }), [], 'sin datos no inventa colores')
})

test('el SKU base se compone del modelo, la capacidad y el color', () => {
  assert.equal(skuDeVariante({ modelo: 'iPhone 15', capacidad: '128GB', color: 'Negro' }), 'IPHONE-15-128GB-NEGRO')
  assert.equal(skuDeVariante({ modelo: 'iPhone 15', capacidad: '128GB' }), 'IPHONE-15-128GB')
  assert.equal(skuDeVariante({}), 'PRODUCTO')
  assert.ok(skuDeVariante({ modelo: 'x'.repeat(80) }).length <= 40)
})

test('la variante existente se detecta para no duplicar el producto', () => {
  assert.equal(varianteExistente({ productos, modelo: 'iPhone 15', capacidad: '128GB', color: 'Negro' })?.id, 'p1')
  assert.equal(varianteExistente({ productos, modelo: 'iPhone 15', capacidad: '128GB', color: 'Verde' }), null)
  assert.equal(varianteExistente({ productos, modelo: 'iPhone 15', capacidad: '512GB' }), null)
})
