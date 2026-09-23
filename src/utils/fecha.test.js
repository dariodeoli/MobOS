import assert from 'node:assert/strict'
import test from 'node:test'
import { fechaValida, fechaHora, fechaDia, fechaHoraCorta, fechaCorta, paraInputFechaHora } from './fecha.js'

// Los valores sin fecha no inventan texto: el vacío es explícito y se puede
// cambiar (los comprobantes usan '').

test('los valores vacíos o inválidos devuelven el texto de vacío', () => {
  for (const valor of [null, undefined, '', 'no es una fecha']) {
    assert.equal(fechaHora(valor), '—')
    assert.equal(fechaDia(valor), '—')
    assert.equal(fechaHoraCorta(valor), '—')
    assert.equal(fechaCorta(valor), '—')
    assert.equal(fechaValida(valor), null)
  }
  assert.equal(fechaHora(null, ''), '')
  assert.equal(fechaCorta('nada', ''), '')
})

test('fechaHora usa fecha y hora cortas de es-PY en 24 h', () => {
  const fecha = new Date(2026, 8, 17, 15, 30)
  assert.equal(fechaHora(fecha), fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false }))
  assert.match(fechaHora(fecha), /15:30/)
  assert.doesNotMatch(fechaHora(fecha), /p\.\s?m\./)
})

test('fechaDia muestra solo el día, sin hora', () => {
  const texto = fechaDia('2026-09-17T12:00:00')
  assert.match(texto, /17/)
  assert.doesNotMatch(texto, /:/)
})

test('fechaHoraCorta y fechaCorta conservan la hora en 24 h', () => {
  const fecha = new Date(2026, 8, 17, 15, 30)
  assert.equal(fechaHoraCorta(fecha), fecha.toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }))
  assert.match(fechaHoraCorta(fecha), /15:30/)
  const corta = fechaCorta(fecha)
  assert.match(corta, /·/)
  assert.match(corta, /15:30/)
  assert.ok(corta.startsWith(fecha.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })))
})

test('fechaValida acepta Date y texto parseable', () => {
  assert.ok(fechaValida(new Date()) instanceof Date)
  assert.ok(fechaValida('2026-09-17') instanceof Date)
})

test('paraInputFechaHora arma el valor de datetime-local en hora local', () => {
  const fecha = new Date(2026, 8, 17, 15, 30)
  assert.equal(paraInputFechaHora(fecha), '2026-09-17T15:30')
  assert.equal(paraInputFechaHora(''), '')
  assert.equal(paraInputFechaHora(null, ''), '')
  assert.equal(paraInputFechaHora('no es fecha'), '')
})
