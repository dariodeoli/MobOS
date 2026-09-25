import assert from 'node:assert/strict'
import test from 'node:test'
import { etiquetaDespacho, etiquetaEta, fechaEta } from './traslados.js'

test('etiquetaEta sin fecha no muestra nada', () => {
  const ahora = new Date('2026-09-25T15:00:00-03:00')
  assert.equal(etiquetaEta(null, null, ahora), null)
  assert.equal(etiquetaEta('', null, ahora), null)
  assert.equal(etiquetaEta('no es fecha', null, ahora), null)
})

test('etiquetaEta muestra el día y solo la marca vencida cuando terminó', () => {
  const ahora = new Date('2026-09-25T15:00:00-03:00')
  const futura = etiquetaEta('2026-09-30T12:00:00.000Z', null, ahora)
  assert.equal(futura.vencida, false)
  assert.match(futura.detalle, /^ETA: /)

  assert.equal(etiquetaEta('2026-09-20T12:00:00.000Z', null, ahora).vencida, true)
})

test('etiquetaEta no la marca vencida si el lote ya fue recibido', () => {
  const ahora = new Date('2026-09-25T15:00:00-03:00')
  assert.equal(etiquetaEta('2026-09-20T12:00:00.000Z', '2026-09-21T10:00:00-03:00', ahora).vencida, false)
})

test('el día de la ETA no se corre por el huso', () => {
  const fecha = fechaEta('2026-10-01T12:00:00.000Z')
  assert.equal(fecha.toLocaleDateString('es-PY'), '1/10/2026')
})

test('etiquetaDespacho arma «Despachó → Recibió» con los nombres', () => {
  const etiqueta = etiquetaDespacho({ dispatchedBy: { name: 'Ana' }, receivedBy: { name: 'Luis' } })
  assert.equal(etiqueta.texto, 'Ana → Luis')
  assert.match(etiqueta.detalle, /Ana/)
  assert.match(etiqueta.detalle, /Luis/)
})

test('etiquetaDespacho aclara la recepción por QR público y la pendiente', () => {
  assert.match(etiquetaDespacho({ dispatchedBy: { name: 'Ana' }, receivedAt: '2026-09-25T10:00:00Z' }).detalle, /por QR público/)
  assert.match(etiquetaDespacho({ dispatchedBy: { name: 'Ana' } }).detalle, /pendiente/)
})

test('etiquetaDespacho sin datos no inventa nombres', () => {
  assert.equal(etiquetaDespacho({}).texto, '—')
  assert.match(etiquetaDespacho({}).detalle, /sin registrar/)
})
