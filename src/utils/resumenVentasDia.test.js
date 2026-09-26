import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenesDeVentas } from './resumenVentasDia.js'

test('las filas de una misma venta cuentan como una sola orden', () => {
  const filas = [
    { id: 'u1', compraId: 'compra-1', precio: 100 },
    { id: 'u2', compraId: 'compra-1', precio: 100 },
    { id: 'u3', compraId: 'compra-1', precio: 100 },
  ]
  const ordenes = ordenesDeVentas(filas)
  assert.equal(ordenes.length, 1)
  assert.equal(ordenes[0].id, 'u1')
})

test('las ventas sueltas y las agrupadas conviven', () => {
  const filas = [
    { id: 'suelta-1' },
    { id: 'a1', compraId: 'compra-a' },
    { id: 'a2', compraId: 'compra-a' },
    { id: 'suelta-2' },
  ]
  assert.equal(ordenesDeVentas(filas).length, 3)
})

test('sin filas no hay órdenes', () => {
  assert.deepEqual(ordenesDeVentas([]), [])
  assert.deepEqual(ordenesDeVentas(), [])
})
