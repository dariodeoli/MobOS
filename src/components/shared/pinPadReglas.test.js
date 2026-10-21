import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TECLA_BORRAR, TECLAS_PIN, aplicarTecla, largoPin, pinCompleto } from './pinPadReglas.js'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

test('los dígitos se agregan hasta completar el PIN y no más', () => {
  let valor = ''
  for (const d of '12345') valor = aplicarTecla(valor, d, 4)
  assert.equal(valor, '1234')
  assert.equal(pinCompleto(valor, 4), true)
  assert.equal(pinCompleto('123', 4), false)
})

test('borrar quita el último dígito y es inocuo con el PIN vacío', () => {
  assert.equal(aplicarTecla('123', TECLA_BORRAR, 4), '12')
  assert.equal(aplicarTecla('', TECLA_BORRAR, 4), '')
})

test('teclas no numéricas no cambian el valor y el largo se acota a 4–6', () => {
  assert.equal(aplicarTecla('12', 'a', 4), '12')
  assert.equal(aplicarTecla('12', '', 4), '12')
  assert.equal(largoPin(2), 4)
  assert.equal(largoPin(9), 6)
  assert.equal(largoPin(), 4)
  assert.equal(aplicarTecla('1234', '5', 6), '12345')
  assert.deepEqual([...TECLAS_PIN].sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('el PinPad se usa en login, demo y bloqueo', () => {
  for (const ruta of ['../../pages/Login.jsx', '../../pages/DemoAccess.jsx', '../app/PantallaBloqueada.jsx']) {
    assert.match(leer(ruta), /import PinPad from '@\/components\/shared\/PinPad'/, ruta)
  }
  const css = leer('../../index.css')
  assert.match(css, /\.pin-seg\.pin-pad \{ --pin-tecla: clamp\(52px, min\(21vw, 9\.5dvh\), 80px\)/)
})
