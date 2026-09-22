import test from 'node:test'
import assert from 'node:assert/strict'
import { TAMANOS_CAMPO, anchoParaLargo } from './tamanos.js'

test('los tamaños recomendados cubren los datos frecuentes', () => {
  assert.equal(TAMANOS_CAMPO.moneda, 'w-36')
  assert.equal(TAMANOS_CAMPO.monedaAmplia, 'w-44')
  assert.equal(TAMANOS_CAMPO.porcentaje, 'w-24')
  assert.equal(TAMANOS_CAMPO.cantidad, 'w-20')
})

test('el ancho por largo del texto no estira el campo de más', () => {
  assert.equal(anchoParaLargo(6), 'w-28')
  assert.equal(anchoParaLargo(0), 'w-28')
  assert.equal(anchoParaLargo(30), 'w-56')
  assert.equal(anchoParaLargo(90), 'w-full')
})
