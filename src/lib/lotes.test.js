import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaLineaDeLote, pendientesDeEnvio, serialesDeEnvio, totalPendienteLotes } from './lotes.js'

const ENVIO = {
  id: 'env-1',
  code: 'ENV-0001',
  pendientes: 3,
  items: [
    { id: 'i1', lineId: 'l1', productId: 'p1', serial: null, product: { name: 'iPhone 15', capacity: '128GB', color: 'Azul' } },
    { id: 'i2', lineId: 'l1', productId: 'p1', serial: '356789102345678', product: { name: 'iPhone 15', capacity: '128GB', color: 'Azul' } },
    { id: 'i3', lineId: 'l1', productId: 'p1', serial: null, product: { name: 'iPhone 15', capacity: '128GB', color: 'Azul' } },
    { id: 'i4', lineId: 'l2', productId: 'p2', serial: null, product: { name: 'iPhone 14', capacity: '256GB', color: null } },
  ],
}

test('las pendientes se agrupan por línea y conservan el producto', () => {
  const lineas = pendientesDeEnvio(ENVIO)
  assert.equal(lineas.length, 2)
  assert.deepEqual(lineas[0], {
    id: 'l1',
    lineId: 'l1',
    productId: 'p1',
    producto: 'iPhone 15',
    capacidad: '128GB',
    color: 'Azul',
    cantidad: 2,
    itemIds: ['i1', 'i3'],
  })
  assert.equal(lineas[1].cantidad, 1)
  assert.equal(lineas[1].producto, 'iPhone 14')
})

test('un envío completo no tiene líneas pendientes', () => {
  assert.deepEqual(pendientesDeEnvio({ items: [{ id: 'i1', lineId: 'l1', serial: 'X' }] }), [])
  assert.deepEqual(pendientesDeEnvio(null), [])
})

test('los seriales cargados se leen por línea', () => {
  assert.deepEqual(serialesDeEnvio(ENVIO), ['356789102345678'])
  assert.deepEqual(serialesDeEnvio(ENVIO, 'l2'), [])
  assert.deepEqual(serialesDeEnvio(ENVIO, 'l1'), ['356789102345678'])
})

test('el total pendiente suma los lotes de la lista', () => {
  assert.equal(totalPendienteLotes([{ pendientes: 2 }, { pendientes: 1 }, {}]), 3)
  assert.equal(totalPendienteLotes([]), 0)
})

test('la etiqueta de la línea muestra producto, capacidad y color', () => {
  assert.equal(etiquetaLineaDeLote({ producto: 'iPhone 15', capacidad: '128GB', color: 'Azul' }), 'iPhone 15 · 128GB · Azul')
  assert.equal(etiquetaLineaDeLote({ producto: 'Cargador' }), 'Cargador')
  assert.equal(etiquetaLineaDeLote(null), 'Producto')
})
