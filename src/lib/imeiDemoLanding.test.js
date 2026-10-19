import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FUENTE_DEMO,
  ESCENARIOS_IMEI_DEMO,
  IMEI_EJEMPLO,
  consultaImeiEjemplo,
  enmascararImeiDemo,
  notaImeiEjemplo,
  validarImeiDemo,
} from './imeiDemoLanding.js'
import { enmascararImei, imeiValido } from './imeiComprobante.js'

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
  assert.equal(ok.etiqueta, 'Sin reportes')
  assert.equal(ok.fuente, FUENTE_DEMO)
  assert.equal(ok.simulado, true)
  assert.equal(ok.costoUsd, 0)
  assert.ok(ok.campos.some((campo) => campo.clave === 'blacklist' && campo.valor === 'Sin reportes actuales'))
  assert.ok(ok.campos.some((campo) => campo.clave === 'blacklistHistorial'), 'la ficha separa blacklist actual del historial Pro')
  assert.ok(ok.campos.every((campo) => campo.fuente === FUENTE_DEMO))

  const blacklist = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'blacklist', ahora: new Date('2026-10-14T12:00:00Z') })
  assert.equal(blacklist.estado, 'verificado')
  assert.equal(blacklist.etiqueta, 'Blacklist detectada')
  assert.equal(blacklist.campos.find((campo) => campo.clave === 'blacklist').valor, 'Reportado · equipo denunciado como perdido')
  assert.equal(blacklist.campos.find((campo) => campo.clave === 'findMy').valor, 'Activado · bloqueo de activación presente')
  assert.ok(blacklist.campos.every((campo) => campo.fuente === FUENTE_DEMO && campo.hora))
  assert.match(notaImeiEjemplo(blacklist), /con reporte de blacklist/)

  const pendiente = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'pendiente' })
  assert.equal(pendiente.etiqueta, 'No verificado')
  assert.equal(pendiente.campos.length, 1)
  assert.ok(!JSON.stringify(pendiente).includes('Limpio'))

  const parcial = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'parcial' })
  assert.equal(parcial.etiqueta, 'Parcial', 'el caso parcial no se disfraza de verificado')
  assert.equal(parcial.campos.at(-1).valor, 'Sin dato en este ejemplo')

  const fallido = consultaImeiEjemplo('356789102345678')
  assert.equal(fallido.estado, 'fallido')
  assert.equal(fallido.etiqueta, 'No verificado')
  assert.equal(fallido.campos.length, 0)
  assert.match(fallido.error, /dígito de control/)

  const escenarioDesconocido = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'limpio' })
  assert.equal(escenarioDesconocido.etiqueta, 'No verificado')
  assert.equal(escenarioDesconocido.campos.length, 0)
  assert.match(escenarioDesconocido.error, /escenario de ejemplo no es válido/)
})

test('el IMEI usa la máscara canónica (#203) y la nota cita fuente y fecha', () => {
  assert.equal(enmascararImeiDemo(IMEI_EJEMPLO), enmascararImei(IMEI_EJEMPLO))
  assert.equal(enmascararImeiDemo(IMEI_EJEMPLO), '•••••••••••3809')
  assert.equal(imeiValido(IMEI_EJEMPLO), true, 'el ejemplo valida con la regla canónica')
  const consulta = consultaImeiEjemplo(IMEI_EJEMPLO, { ahora: new Date('2026-09-21T12:00:00Z') })
  assert.equal(consulta.imeiMasked, '•••••••••••3809')
  const nota = notaImeiEjemplo(consulta)
  assert.match(nota, /sin reportes al 21\/09\/2026/)
  assert.match(nota, /Fuente de ejemplo \(simulada\)/)
  assert.equal(notaImeiEjemplo(consultaImeiEjemplo('1')), '')
})

test('los escenarios de operadora y cobertura son ficticios, fechados y recomiendan una acción', () => {
  const ahora = new Date('2026-10-19T12:00:00Z')
  assert.deepEqual(ESCENARIOS_IMEI_DEMO.map(({ id }) => id), [
    'ok', 'blacklist', 'operadora', 'tigo', 'garantia-apple-vigente', 'garantia-apple-vencida',
  ])

  const operadora = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'operadora', ahora })
  assert.equal(operadora.etiqueta, 'Bloqueo de operadora')
  assert.equal(operadora.tono, 'bad')
  assert.match(operadora.campos.find((campo) => campo.clave === 'simLock').valor, /bloqueado para operador/i)

  const tigo = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'tigo', ahora })
  assert.equal(tigo.etiqueta, 'Bloqueado por Tigo')
  assert.match(tigo.campos.find((campo) => campo.clave === 'simLock').valor, /ejemplo ficticio/i)

  const vigente = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'garantia-apple-vigente', ahora })
  const vencida = consultaImeiEjemplo(IMEI_EJEMPLO, { escenario: 'garantia-apple-vencida', ahora })
  const fechaVigente = vigente.campos.find((campo) => campo.clave === 'garantia').valor.match(/(\d{2}\/\d{2}\/\d{4})/)[1]
  const fechaVencida = vencida.campos.find((campo) => campo.clave === 'garantia').valor.match(/(\d{2}\/\d{2}\/\d{4})/)[1]
  const comoFecha = (fecha) => {
    const [dia, mes, anio] = fecha.split('/').map(Number)
    return new Date(anio, mes - 1, dia)
  }
  assert.ok(comoFecha(fechaVigente) > ahora)
  assert.ok(comoFecha(fechaVencida) < ahora)
  assert.equal(vigente.tono, 'good')
  assert.equal(vencida.tono, 'warn')

  for (const consulta of [operadora, tigo, vigente, vencida]) {
    assert.equal(consulta.simulado, true)
    assert.equal(consulta.costoUsd, 0)
    assert.ok(consulta.fecha)
    assert.ok(consulta.fuente.includes('simulada'))
    assert.ok(consulta.motivo)
    assert.ok(consulta.recomendacion)
    assert.ok(consulta.campos.every((campo) => campo.fuente === FUENTE_DEMO && campo.hora))
    assert.match(notaImeiEjemplo(consulta), /con (bloqueo|garantía)/)
  }
})
