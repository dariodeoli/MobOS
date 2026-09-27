// Cotizaciones en el portal (#240): una sola verdad para el chip, el aviso y
// la página pública (etiquetas, tono, vencimiento y enlace).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ABIERTAS, ESTADO_COTIZACION, aprobacionConCodigo, cotizacionUrlFor, diasParaVencer, estadoCotizacion, etiquetaCotizacion, tonoCotizacion } from './cotizaciones.js'

const AHORA = Date.parse('2026-09-23T12:00:00.000Z')
const DIA = 86400000
const enDias = (dias) => new Date(AHORA + dias * DIA).toISOString()

test('todos los estados tienen etiqueta y tono', () => {
  for (const estado of ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED', 'CANCELLED']) {
    assert.ok(ESTADO_COTIZACION[estado], `falta la etiqueta de ${estado}`)
    assert.ok(tonoCotizacion(estado), `falta el tono de ${estado}`)
  }
  assert.equal(ABIERTAS.includes('SENT'), true)
})

test('una cotización abierta con la validez cumplida se muestra vencida', () => {
  assert.equal(estadoCotizacion({ status: 'SENT', validUntil: enDias(2) }, AHORA), 'SENT')
  assert.equal(estadoCotizacion({ status: 'SENT', validUntil: enDias(0) }, AHORA), 'EXPIRED')
  assert.equal(estadoCotizacion({ status: 'SENT', validUntil: enDias(-1) }, AHORA), 'EXPIRED')
  assert.equal(estadoCotizacion({ status: 'SENT', validUntil: null }, AHORA), 'SENT')
  // Los estados cerrados no dependen de la validez.
  assert.equal(estadoCotizacion({ status: 'ACCEPTED', validUntil: enDias(-10) }, AHORA), 'ACCEPTED')
  assert.equal(estadoCotizacion({ status: 'CONVERTED', validUntil: enDias(-10) }, AHORA), 'CONVERTED')
})

test('los días para vencer se calculan sobre la fecha de validez', () => {
  assert.equal(diasParaVencer({ validUntil: enDias(2) }, AHORA), 2)
  assert.equal(diasParaVencer({ validUntil: enDias(0) }, AHORA), 0)
  assert.equal(diasParaVencer({ validUntil: enDias(-3) }, AHORA), -3)
  assert.equal(diasParaVencer({ validUntil: null }, AHORA), null)
  assert.equal(diasParaVencer({}, AHORA), null)
})

test('el enlace público sale del token y respeta el modo demo', () => {
  assert.equal(cotizacionUrlFor({ publicToken: 'abc 123' }), '/cotizacion/abc%20123')
  assert.equal(cotizacionUrlFor({ publicToken: 'demo-cot-lucia' }, { demo: true }), '/cotizacion/demo-cot-lucia?demo=1')
  assert.equal(cotizacionUrlFor({ publicToken: null }), '')
})

// A3 (#279): la aprobación con código se muestra como «Aprobada con código»;
// sin el dato (o con la aceptación por enlace) se conserva la etiqueta previa.
test('la aprobación con código se etiqueta «Aprobada con código»', () => {
  const conCodigo = { status: 'ACCEPTED', approval: { method: 'OTP', at: new Date(), destination: '•••• 4821', version: 2 } }
  assert.equal(aprobacionConCodigo(conCodigo), true)
  assert.equal(etiquetaCotizacion(conCodigo), 'Aprobada con código')
  const porEnlace = { status: 'ACCEPTED', approval: { method: 'LINK', at: new Date() } }
  assert.equal(aprobacionConCodigo(porEnlace), false)
  assert.equal(etiquetaCotizacion(porEnlace), ESTADO_COTIZACION.ACCEPTED)
  const sinAprobacion = { status: 'SENT' }
  assert.equal(etiquetaCotizacion(sinAprobacion), ESTADO_COTIZACION.SENT)
})
