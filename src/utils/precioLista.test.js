import test from 'node:test'
import assert from 'node:assert/strict'
import { ahorroDeLinea } from './precioLista.js'

test('por debajo de lista muestra el descuento de la línea', () => {
  const { descuentoLista, ahorro } = ahorroDeLinea({ quantity: 2, unitPricePyg: 800000, listPricePyg: 1000000 })
  assert.equal(descuentoLista, 400000)
  assert.equal(ahorro, 400000)
})

test('por encima de lista no marca nada: se muestra como precio normal', () => {
  const { descuentoLista, ahorro } = ahorroDeLinea({ quantity: 1, unitPricePyg: 1200000, listPricePyg: 1000000 })
  assert.equal(descuentoLista, 0)
  assert.equal(ahorro, 0)
})

test('sin precio de lista (ventas viejas) no inventa descuentos', () => {
  const { ahorro } = ahorroDeLinea({ quantity: 1, unitPricePyg: 900000 })
  assert.equal(ahorro, 0)
})

test('suma el descuento explícito de la línea al ahorro visible', () => {
  const { ahorro, descuentoLista, descuentoLinea } = ahorroDeLinea({ quantity: 1, unitPricePyg: 900000, listPricePyg: 1000000, discountPyg: 50000 })
  assert.equal(descuentoLista, 100000)
  assert.equal(descuentoLinea, 50000)
  assert.equal(ahorro, 150000)
})

test('acepta las ventas demo con precio y cantidad por defecto', () => {
  const { ahorro } = ahorroDeLinea({ precio: 700000, listPricePyg: 1000000 })
  assert.equal(ahorro, 300000)
  assert.equal(ahorroDeLinea({}).ahorro, 0)
})
