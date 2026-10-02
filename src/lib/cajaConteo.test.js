import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DENOMINACIONES,
  MODO_DETALLADO,
  MODO_RAPIDO,
  desgloseItems,
  desglosePayload,
  normalizarCantidad,
  resumenConteo,
  totalArqueo,
} from './cajaConteo.js'

test('las denominaciones del arqueo son las del backend, de mayor a menor', () => {
  const valores = DENOMINACIONES.map(({ valor }) => valor)
  assert.deepEqual(valores, [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100])
  for (let i = 1; i < valores.length; i += 1) assert.ok(valores[i - 1] > valores[i])
})

test('el total del arqueo suma solo las cantidades cargadas', () => {
  assert.equal(totalArqueo({}), 0)
  assert.equal(totalArqueo({ 100000: 2, 1000: '3', 500: 0 }), 203000)
  assert.deepEqual(desgloseItems({ 100000: 2, 100: 1 }), [
    { valor: 100000, cantidad: 2 },
    { valor: 100, cantidad: 1 },
  ])
})

test('el desglose para el backend solo incluye denominaciones con cantidad', () => {
  assert.deepEqual(desglosePayload({ 50000: 1, 10000: 0, 500: 4 }), { 50000: 1, 500: 4 })
  assert.deepEqual(desglosePayload({}), {})
})

test('la cantidad se normaliza a entero positivo y con tope de 7 dígitos', () => {
  assert.equal(normalizarCantidad('5'), '5')
  assert.equal(normalizarCantidad('0'), '')
  assert.equal(normalizarCantidad(''), '')
  assert.equal(normalizarCantidad('-3'), '')
  assert.equal(normalizarCantidad('2.9'), '2')
  assert.equal(normalizarCantidad('99999999'), '9999999')
})

test('modo rápido: vale el total escrito y el conteo vacío no es un cero', () => {
  const sinConteo = resumenConteo({ modo: MODO_RAPIDO, totalRapido: '', esperado: 500000 })
  assert.equal(sinConteo.hayConteo, false)
  assert.equal(sinConteo.contado, 0)
  assert.equal(sinConteo.diferencia, -500000)

  const conCero = resumenConteo({ modo: MODO_RAPIDO, totalRapido: '0', esperado: 500000 })
  assert.equal(conCero.hayConteo, true)
  assert.equal(conCero.contado, 0)

  const conTotal = resumenConteo({ modo: MODO_RAPIDO, totalRapido: 480000, esperado: 500000 })
  assert.equal(conTotal.contado, 480000)
  assert.equal(conTotal.diferencia, -20000)
})

test('modo detallado: vale la suma de las denominaciones e ignora el total rápido', () => {
  const resumen = resumenConteo({
    modo: MODO_DETALLADO,
    cantidades: { 100000: 3, 10000: 2 },
    totalRapido: 999999,
    esperado: 320000,
  })
  assert.equal(resumen.contado, 320000)
  assert.equal(resumen.hayConteo, true)
  assert.equal(resumen.diferencia, 0)
  assert.equal(resumen.items.length, 2)
})

test('modo detallado vacío no habilita el cierre aunque haya total rápido viejo', () => {
  const resumen = resumenConteo({ modo: MODO_DETALLADO, cantidades: {}, totalRapido: '500000' })
  assert.equal(resumen.hayConteo, false)
  assert.equal(resumen.contado, 0)
})
