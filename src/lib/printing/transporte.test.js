import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datosTransporte, resumenTransporte } from './transporte.js'

// #276 · El historial no puede rotular mal el transporte: los dos perfiles de
// Dario (ZKP8008 CUPS y ZKP8008 TCP, ambos por LAN) y el fallback TCP→CUPS.
test('perfil CUPS: solicitado CUPS y conexión LAN resuelta por URI (nunca USB por el nombre)', () => {
  const fila = { solicitado: 'cups', transporte: 'cups', fallback: false, conexion: 'lan' }
  const datos = datosTransporte(fila)
  assert.equal(datos.solicitado, 'CUPS')
  assert.equal(datos.ejecutado, 'CUPS')
  assert.equal(datos.conexion, 'LAN')
  assert.equal(datos.fallback, false)
})

test('perfil TCP con fallback a CUPS: muestra lo pedido, lo ejecutado y el motivo', () => {
  const fila = { solicitado: 'tcp', transporte: 'cups', fallback: true, motivo: 'La salida directa falló (EHOSTUNREACH); se usó la cola CUPS.', conexion: 'lan' }
  const datos = datosTransporte(fila)
  assert.equal(datos.solicitado, 'TCP')
  assert.equal(datos.ejecutado, 'CUPS')
  assert.equal(datos.fallback, true)
  assert.match(datos.motivo, /EHOSTUNREACH/)
  assert.equal(datos.conexion, 'LAN')
})

test('TCP directo y USB directo se etiquetan con su conexión real', () => {
  assert.deepEqual(datosTransporte({ solicitado: 'tcp', transporte: 'directo', conexion: 'lan' }), { solicitado: 'TCP', ejecutado: 'TCP directo', fallback: false, motivo: '', conexion: 'LAN' })
  assert.equal(datosTransporte({ solicitado: 'tcp', transporte: 'usb', conexion: 'usb' }).ejecutado, 'USB directo')
  assert.equal(datosTransporte({ solicitado: 'cups', transporte: 'cups', conexion: 'serial' }).conexion, 'Serial')
})

test('acepta los nombres del backend y no inventa la conexión sin URI', () => {
  const datos = datosTransporte({ requestedTransport: 'tcp', transport: 'cups', fallback: true, fallbackReason: 'Cola de respaldo.', physicalConnection: 'lan' })
  assert.equal(datos.solicitado, 'TCP')
  assert.equal(datos.ejecutado, 'CUPS')
  assert.equal(datos.motivo, 'Cola de respaldo.')
  assert.equal(datos.conexion, 'LAN')
  // Sin conexión reportada: queda «—» (jamás USB por el nombre de la cola).
  const sinDato = datosTransporte({ transporte: 'cups' })
  assert.equal(sinDato.conexion, '')
  assert.equal(resumenTransporte({ transporte: 'cups' }), 'ejecutado CUPS')
})
