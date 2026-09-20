import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DENOMINACIONES,
  desgloseItems,
  desglosePayload,
  diferenciaArqueo,
  totalArqueo,
} from './arqueo.js'

test('las denominaciones son las mismas que acepta el backend', () => {
  assert.deepEqual(
    DENOMINACIONES.map((d) => d.valor),
    [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50],
  )
})

test('sin denominaciones cargadas el total es cero', () => {
  assert.equal(totalArqueo({}), 0)
  assert.deepEqual(desgloseItems({}), [])
  assert.deepEqual(desglosePayload({}), {})
})

test('el arqueo suma billetes y monedas y calcula subtotales', () => {
  const cantidades = { 100000: '2', 50000: 1, 1000: 3, 50: 4 }
  assert.equal(totalArqueo(cantidades), 253200)
  assert.deepEqual(desgloseItems(cantidades), [
    { valor: 100000, tipo: 'Billete', cantidad: 2, subtotal: 200000 },
    { valor: 50000, tipo: 'Billete', cantidad: 1, subtotal: 50000 },
    { valor: 1000, tipo: 'Moneda', cantidad: 3, subtotal: 3000 },
    { valor: 50, tipo: 'Moneda', cantidad: 4, subtotal: 200 },
  ])
  assert.deepEqual(desglosePayload(cantidades), { 100000: 2, 50000: 1, 1000: 3, 50: 4 })
})

test('los ceros no entran al desglose y los valores inválidos tampoco', () => {
  assert.deepEqual(desglosePayload({ 100000: 0, 50000: '' }), {})
  assert.equal(totalArqueo({ 100000: -3 }), 0)
  assert.equal(totalArqueo({ 100000: 1.5 }), 0)
  assert.equal(totalArqueo({ 100000: 'dos' }), 0)
})

test('la diferencia es negativa cuando falta efectivo en la caja', () => {
  assert.equal(diferenciaArqueo(780000, 800000), -20000)
  assert.equal(diferenciaArqueo(800000, 800000), 0)
  assert.equal(diferenciaArqueo(810000, 800000), 10000)
  assert.equal(diferenciaArqueo(null, 100), -100)
})
