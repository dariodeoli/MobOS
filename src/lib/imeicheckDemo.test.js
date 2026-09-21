import assert from 'node:assert/strict'
import test from 'node:test'
import { consultaImeiDemo, enmascararImeiDemo, notaClienteDemo, validarImeiDemo, FUENTE_DEMO } from './imeicheckDemo.js'

// #200/#201: la demo simula la verificación de IMEI sin llamar ni cobrar.

test('valida el IMEI con Luhn antes de simular', () => {
  assert.equal(validarImeiDemo('490154203237518').ok, true)
  assert.equal(validarImeiDemo('123').ok, false)
  assert.match(validarImeiDemo('123').error, /15 dígitos/)
  assert.equal(validarImeiDemo('490154203237519').ok, false, 'Luhn inválido')
  assert.match(validarImeiDemo('490154203237519').error, /Luhn/)
})

test('el resultado simulado queda marcado y sin costo', () => {
  const consulta = consultaImeiDemo('490154203237518', { ahora: new Date('2026-09-21T12:00:00.000Z') })
  assert.equal(consulta.simulado, true)
  assert.equal(consulta.esMock, true)
  assert.equal(consulta.costoUsd, 0)
  assert.equal(consulta.etiqueta, 'Verificado')
  assert.equal(consulta.fuente, FUENTE_DEMO)
  assert.equal(consulta.imeiMasked.endsWith('7518'), true)
  assert.equal(consulta.imeiMasked.includes('49015420'), false, 'nunca en claro')
  assert.ok(consulta.campos.every(campo => campo.fuente === FUENTE_DEMO && campo.hora))
})

test('lo no verificado no dice "Limpio"', () => {
  const pendiente = consultaImeiDemo('490154203237518', { escenario: 'pendiente' })
  assert.equal(pendiente.estado, 'pendiente')
  assert.equal(pendiente.etiqueta, 'No verificado')
  const invalido = consultaImeiDemo('123')
  assert.equal(invalido.estado, 'fallido')
  assert.equal(invalido.etiqueta, 'No verificado')
  assert.equal(invalido.costoUsd, 0)
})

test('la nota para el cliente lleva fuente y fecha', () => {
  const consulta = consultaImeiDemo('490154203237518', { ahora: new Date('2026-09-21T12:00:00.000Z') })
  const nota = notaClienteDemo(consulta)
  assert.match(nota, /IMEI verificado: sin reportes al \d{2}\/\d{2}\/\d{4}/)
  assert.match(nota, /IMEIcheck\.net \(simulado\)/)
  assert.equal(notaClienteDemo(consultaImeiDemo('123')), '', 'sin resultado no hay nota')
})

test('el enmascarado deja solo los últimos dígitos', () => {
  assert.equal(enmascararImeiDemo('490154203237518'), '•••••••••••7518')
  assert.equal(enmascararImeiDemo('123'), '•••')
})
