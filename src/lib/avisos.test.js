import assert from 'node:assert/strict'
import test from 'node:test'
import { textoGarantia, variablesDeProducto, PLANTILLA_POR_ENTREGA, PLANTILLA_POR_TALLER, armarCorreo, correoValido, mailtoUrl, plantillaCorreoDeEvento, plantillaDeCuota, plantillaDeEntrega } from './avisos.js'

const correo = (evento, extra = {}) => ({ key: `email.${evento}`, channel: 'email', subject: `Asunto ${evento} {{pedido}}`, body: 'Hola {{cliente}},\n\nTu pedido {{pedido}}.', isActive: true, ...extra })

test('cada estado de entrega y de taller conocido apunta a una plantilla del evento', () => {
  assert.equal(plantillaDeEntrega('READY_FOR_PICKUP'), 'ready_for_pickup')
  assert.equal(plantillaDeEntrega('DELIVERED'), 'entregado')
  assert.equal(plantillaDeEntrega('NOT_DELIVERED'), '')
  for (const key of [...Object.values(PLANTILLA_POR_ENTREGA), ...Object.values(PLANTILLA_POR_TALLER)]) assert.match(key, /^[a-z_]+$/)
  assert.equal(plantillaDeCuota(true), 'cuota_vencida')
  assert.equal(plantillaDeCuota(false), 'cuota_por_vencer')
})

test('la plantilla de correo se busca por la clave email.<evento> y respeta si está inactiva', () => {
  const lista = [{ key: 'entregado', channel: 'whatsapp', body: 'x' }, correo('entregado'), correo('resena', { isActive: false })]
  assert.equal(plantillaCorreoDeEvento(lista, 'entregado').key, 'email.entregado')
  assert.equal(plantillaCorreoDeEvento(lista, 'resena'), null)
  assert.equal(plantillaCorreoDeEvento(lista, 'otro'), null)
  assert.equal(plantillaCorreoDeEvento(null, 'entregado'), null)
})

test('el correo completa asunto y cuerpo con los datos del evento', () => {
  const armado = armarCorreo(correo('entregado'), { cliente: 'Ana', pedido: 'MOB-0007' })
  assert.equal(armado.asunto, 'Asunto entregado MOB-0007')
  assert.equal(armado.cuerpo, 'Hola Ana,\n\nTu pedido MOB-0007.')
  assert.equal(armarCorreo(null), null)
})

test('mailto escapa asunto y cuerpo y exige una casilla válida', () => {
  const url = mailtoUrl('ana@example.com', { asunto: 'Tu pedido & más', cuerpo: 'Hola\nAna' })
  assert.equal(url, 'mailto:ana@example.com?subject=Tu%20pedido%20%26%20m%C3%A1s&body=Hola%0AAna')
  assert.equal(mailtoUrl('sin-arroba', { asunto: 'x' }), '')
  assert.equal(correoValido(' ana@example.com '), true)
  assert.equal(correoValido(''), false)
})

test('la garantía se dice en meses cuando son múltiplos de 30 días y calcula la fecha de fin', () => {
  assert.equal(textoGarantia(360), '12 meses')
  assert.equal(textoGarantia(30), '1 mes')
  assert.equal(textoGarantia(45), '45 días')
  assert.equal(textoGarantia(0), '')
  const vars = variablesDeProducto([{ description: 'Funda' }, { description: 'iPhone 15', warrantyDays: 90 }], '2026-09-01T12:00:00Z')
  assert.equal(vars.producto, 'iPhone 15')
  assert.equal(vars.garantia, '3 meses')
  assert.match(vars.garantia_hasta, /\d/)
  assert.deepEqual(variablesDeProducto([], null), { producto: '', garantia: '', garantia_hasta: '' })
})
