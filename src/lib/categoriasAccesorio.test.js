import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIAS_ACCESORIO, categoriaAccesorioDe, chipsAccesorio, filtrarPorAccesorio, modelosCompatibles, parseModelosCompatibles, textoCompatibilidad } from './categoriasAccesorio.js'

test('categoriaAccesorioDe: la clave guardada manda y el nombre infiere el resto', () => {
  assert.equal(categoriaAccesorioDe({ accessoryCategory: 'CABLE', name: 'Funda' }), 'CABLE')
  assert.equal(categoriaAccesorioDe({ name: 'Lámina de vidrio templado iPhone 17' }), 'LAMINA')
  assert.equal(categoriaAccesorioDe({ nombre: 'Funda silicona MagSafe' }), 'CASE')
  assert.equal(categoriaAccesorioDe({ nombre: 'Cable USB-C a Lightning 1 m' }), 'CABLE')
  assert.equal(categoriaAccesorioDe({ nombre: 'Cargador 20W' }), 'CARGADOR')
  assert.equal(categoriaAccesorioDe({ nombre: 'AirPods Pro 2' }), 'AUDIO')
  assert.equal(categoriaAccesorioDe({ nombre: 'iPhone 17 Pro 256GB', category: 'Celulares' }), null)
  assert.equal(categoriaAccesorioDe({ accessoryCategory: 'MAGIA', name: 'Nada' }), null)
  assert.deepEqual(Object.keys(CATEGORIAS_ACCESORIO), ['LAMINA', 'CASE', 'CABLE', 'CARGADOR', 'AUDIO', 'OTRO'])
})

test('compatibilidad: texto «para …» y lista limpia', () => {
  assert.equal(textoCompatibilidad({ compatibleModels: ['iPhone 17 Pro'] }), 'para iPhone 17 Pro')
  assert.equal(textoCompatibilidad({ compatibleModels: ['iPhone 17 Pro', 'iPhone 17', 'iPhone Air'] }), 'para iPhone 17 Pro +2 más')
  assert.equal(textoCompatibilidad({ compatibleModels: ['A', 'B'] }, { max: 2 }), 'para A, B')
  assert.equal(textoCompatibilidad({}), '')
  assert.deepEqual(modelosCompatibles({ compatibleModels: ' A , A, ,B ' }), ['A', 'B'])
  assert.deepEqual(parseModelosCompatibles('iPhone 17 Pro; iPhone 17\niPhone 17'), ['iPhone 17 Pro', 'iPhone 17'])
})

test('chips y filtro por categoría de accesorio', () => {
  const productos = [
    { id: 1, name: 'Lámina iPhone 17' }, { id: 2, name: 'Lámina iPhone 16' },
    { id: 3, accessoryCategory: 'CASE', name: 'Algo' }, { id: 4, name: 'iPhone 17 Pro' },
  ]
  const chips = chipsAccesorio(productos)
  assert.deepEqual(chips.map((chip) => [chip.clave, chip.cantidad]), [['LAMINA', 2], ['CASE', 1]])
  assert.ok(chips.every((chip) => chip.icon && chip.label))
  assert.equal(filtrarPorAccesorio(productos, 'LAMINA').length, 2)
  assert.equal(filtrarPorAccesorio(productos, 'todas').length, 4)
  assert.equal(filtrarPorAccesorio(productos, 'CABLE').length, 0)
})
