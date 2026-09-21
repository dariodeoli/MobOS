import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FUENTE_DEMO,
  IMEI_EJEMPLO,
  consultaImeiEjemplo,
  enmascararImeiDemo,
  notaImeiEjemplo,
  validarImeiDemo,
} from './imeiDemoLanding.js'

test('el IMEI de ejemplo de la landing es válido (15 dígitos + Luhn)', () => {
  assert.equal(IMEI_EJEMPLO.length, 15)
  assert.deepEqual(validarImeiDemo(IMEI_EJEMPLO), { ok: true, imei: IMEI_EJEMPLO })
  assert.equal(validarImeiDemo('356789102345678').ok, false, 'un dígito cambiado no pasa Luhn')
  assert.equal(validarImeiDemo('12345').ok, false)
  assert.equal(validarImeiDemo('').ok, false)
})

test('la consulta de ejemplo nunca miente: sin verificar no dice "Limpio"', () => {
  const ok = consultaImeiEjemplo(IMEI_EJEMPLO, { ahora: new Date('2026-09-21T12:00:00Z') })
  assert.equal(ok.estado, 'verificado')
  assert.equal(ok.etiqueta, 'Verificado')
  assert.equal(ok.fuente, FUENTE_DEMO)
  assert.equal(ok.simulado, true)
  assert.equal(ok.costoUsd, 0)
  assert.ok(ok.campos.some((campo) => campo.clave === 'blacklist' && campo.valor === 'Sin reportes actuales'))
  assert.ok(ok.campos.some((campo) => campo.clave === 'blacklistHistorial'), 'la ficha separa blacklist actual del historial Pro')
  assert.ok(ok.campos.every((campo) => campo.fuente === FUENTE_DEMO))

  const pendiente = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'pendiente' })
  assert.equal(pendiente.etiqueta, 'No verificado')
  assert.equal(pendiente.campos.length, 1)
  assert.ok(!JSON.stringify(pendiente).includes('Limpio'))

  const parcial = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'parcial' })
  assert.equal(parcial.etiqueta, 'Parcial', 'el caso parcial no se disfraza de verificado')
  assert.equal(parcial.campos.at(-1).valor, 'Sin dato del proveedor')

  const fallido = consultaImeiEjemplo('356789102345678')
  assert.equal(fallido.estado, 'fallido')
  assert.equal(fallido.etiqueta, 'No verificado')
  assert.equal(fallido.campos.length, 0)
  assert.match(fallido.error, /Luhn/)
})

test('el IMEI se muestra enmascarado y la nota cita fuente y fecha', () => {
  assert.equal(enmascararImeiDemo(IMEI_EJEMPLO), '•••••••••••3809')
  const consulta = consultaImeiEjemplo(IMEI_EJEMPLO, { ahora: new Date('2026-09-21T12:00:00Z') })
  assert.equal(consulta.imeiMasked, '•••••••••••3809')
  const nota = notaImeiEjemplo(consulta)
  assert.match(nota, /sin reportes al 21\/09\/2026/)
  assert.match(nota, /IMEIcheck\.net \(simulado\)/)
  assert.equal(notaImeiEjemplo(consultaImeiEjemplo('1')), '')
})
