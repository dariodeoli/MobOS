import assert from 'node:assert/strict'
import test from 'node:test'
import { PLANTILLAS_CORREO_DEMO, PLANTILLAS_DEMO, plantillasDemo } from './plantillas.js'
import { canalDe } from '../whatsappPlantillas.js'
import { armarCorreo, plantillaCorreoDeEvento } from '../avisos.js'

test('la demo trae los cinco eventos nuevos en WhatsApp y su versión correo', () => {
  const claves = new Set(PLANTILLAS_DEMO.map((item) => item.key))
  for (const evento of ['pedido_confirmado', 'sobre_pedido_llego', 'garantia_registrada', 'cotizacion_enviada', 'resena']) {
    assert.ok(claves.has(evento), `WhatsApp ${evento}`)
    assert.ok(PLANTILLAS_CORREO_DEMO.some((item) => item.key === `email.${evento}`), `correo ${evento}`)
  }
})

test('las plantillas de correo de la demo llevan canal, asunto y prefijo, y no se mezclan con WhatsApp', () => {
  for (const item of PLANTILLAS_CORREO_DEMO) {
    assert.equal(canalDe(item), 'email')
    assert.ok(item.subject && item.key.startsWith('email.') && item.isActive)
  }
  assert.ok(plantillasDemo('ORDERS').every((item) => canalDe(item) === 'whatsapp'))
  assert.ok(plantillasDemo('ORDERS', 'email').every((item) => canalDe(item) === 'email'))
  assert.ok(plantillasDemo('ORDERS', 'todos').length > plantillasDemo('ORDERS').length)
})

test('el aviso por correo del evento arma asunto y cuerpo con los datos', () => {
  const plantilla = plantillaCorreoDeEvento(plantillasDemo('ORDERS', 'email'), 'cotizacion_enviada')
  const correo = armarCorreo(plantilla, { cliente: 'Ana', cotizacion: 'COT-0001', total: 'Gs. 1.000.000', vigencia: '30/09/2026', enlace: 'https://x.test/c', empresa: 'MobOS' })
  assert.equal(correo.asunto, 'Tu cotización COT-0001')
  assert.match(correo.cuerpo, /Ana/)
  assert.match(correo.cuerpo, /https:\/\/x\.test\/c/)
  assert.doesNotMatch(correo.cuerpo, /\{\{/)
})
