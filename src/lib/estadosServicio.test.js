// #240 §4: los estados del taller se leen igual en la tabla interna, la ficha
// del cliente y el portal (una sola fuente de etiquetas y tonos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO_SERVICIO_LABEL, ESTADOS_SERVICIO, etiquetaServicio, tonoServicio, tonoServicioPortal } from './estadosServicio.js'

test('los estados del taller tienen etiqueta y tono en todas las superficies', () => {
  assert.equal(ESTADOS_SERVICIO.length, 8)
  assert.equal(etiquetaServicio('LISTO'), 'Listo para retirar')
  assert.equal(etiquetaServicio('ENTREGADO'), 'Entregado')
  assert.equal(etiquetaServicio('RECIBIDO'), 'Recibido')
  // Un estado desconocido no se oculta: se muestra tal cual.
  assert.equal(etiquetaServicio('PENDIENTE_RARO'), 'PENDIENTE_RARO')
  assert.equal(etiquetaServicio(''), '')
  assert.equal(Object.keys(ESTADO_SERVICIO_LABEL).length, 8)
})

test('el tono de la tabla y el del portal salen del mismo estado', () => {
  assert.equal(tonoServicio('CANCELADO'), 'red')
  assert.equal(tonoServicio('LISTO'), 'green')
  assert.equal(tonoServicio('DESCONOCIDO'), 'slate')
  assert.equal(tonoServicioPortal('REPARADO'), 'ok')
  assert.equal(tonoServicioPortal('LISTO'), 'ok')
  assert.equal(tonoServicioPortal('ESPERANDO_REPUESTO'), 'warn')
  assert.equal(tonoServicioPortal('CANCELADO'), 'bad')
  assert.equal(tonoServicioPortal('ENTREGADO'), 'neutro')
  assert.equal(tonoServicioPortal('DIAGNOSTICO'), 'info')
})
