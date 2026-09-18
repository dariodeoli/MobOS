import assert from 'node:assert/strict'
import test from 'node:test'
import { dimensionesComprimidas } from './imagen.js'

test('no agranda una imagen que ya es chica', () => {
  assert.deepEqual(dimensionesComprimidas(800, 600, 1600), { ancho: 800, alto: 600 })
})

test('reduce el lado mayor conservando la proporción', () => {
  assert.deepEqual(dimensionesComprimidas(4000, 3000, 1600), { ancho: 1600, alto: 1200 })
  assert.deepEqual(dimensionesComprimidas(3000, 4000, 1600), { ancho: 1200, alto: 1600 })
})

test('valores inválidos no rompen el cálculo', () => {
  assert.deepEqual(dimensionesComprimidas(NaN, 100), { ancho: NaN, alto: 100 })
  assert.deepEqual(dimensionesComprimidas(0, 0, 1600), { ancho: 0, alto: 0 })
})
