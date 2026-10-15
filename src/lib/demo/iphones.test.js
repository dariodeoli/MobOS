import test from 'node:test'
import assert from 'node:assert/strict'
import { imeiDemo, serialDemo, IMEIS_DEMO_FICTICIOS } from './iphones.js'
import { luhnValido } from '../escanerSeriales.js'

test('imeiDemo da 15 dígitos, prefijo 35 y Luhn válido', () => {
  for (let semilla = 0; semilla < 2000; semilla += 1) {
    const imei = imeiDemo(semilla)
    assert.match(imei, /^35\d{13}$/)
    assert.equal(imei.length, 15)
    assert.equal(luhnValido(imei), true, imei)
    assert.ok(!/000$/.test(imei) || semilla > 0, 'no termina en 000 en las primeras semillas')
  }
})

test('imeiDemo es determinista y único por semilla', () => {
  assert.equal(imeiDemo(7), imeiDemo(7))
  const vistos = new Set(Array.from({ length: 5000 }, (_, i) => imeiDemo(i)))
  assert.equal(vistos.size, 5000)
  assert.equal(new Set(IMEIS_DEMO_FICTICIOS).size, IMEIS_DEMO_FICTICIOS.length)
  assert.equal(serialDemo(3), imeiDemo(3))
})

test('ningún IMEI demo de las primeras semillas termina en 000 (heurística de Excel)', () => {
  for (let semilla = 0; semilla < 400; semilla += 1) assert.ok(!/000$/.test(imeiDemo(semilla)), imeiDemo(semilla))
})
