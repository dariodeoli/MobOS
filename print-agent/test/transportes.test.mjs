import assert from 'node:assert/strict'
import test from 'node:test'
import { comandoColaLan, enviarLan, motivoDeFalloRed, probarConexionDetalle } from '../transportes.mjs'

// Red de prueba reservada (TEST-NET-1, RFC 5737): nadie responde y el bind a
// una IP que no está en la máquina falla con EADDRNOTAVAIL. Sirve para probar
// el fallback sin depender de la red real.
const SIN_RESPUESTA = 'lan:192.0.2.1:9100'
const ALIAS_AUSENTE = '192.0.2.99'

test('el fallo TCP con alias presente y en su subred queda como permiso o red', () => {
  assert.equal(motivoDeFalloRed({ errno: 'EHOSTUNREACH', aliasPresente: true, host: '192.168.1.23', aliasIp: '192.168.1.100' }), 'permiso_o_red')
  assert.equal(motivoDeFalloRed({ errno: 'ENETUNREACH', aliasPresente: true, host: '192.168.1.23', aliasIp: '192.168.1.100' }), 'permiso_o_red')
})

test('sin alias presente el fallo de ruta es red cambiada', () => {
  assert.equal(motivoDeFalloRed({ errno: 'EHOSTUNREACH', aliasPresente: false, host: '192.168.1.23', aliasIp: '192.168.1.100' }), 'red_cambiada')
  assert.equal(motivoDeFalloRed({ errno: 'EHOSTUNREACH', aliasPresente: true, host: '192.168.9.23', aliasIp: '192.168.1.100' }), 'red_cambiada', 'otra subred no es ambigua')
})

test('EACCES/EPERM y ECONNREFUSED conservan su motivo', () => {
  assert.equal(motivoDeFalloRed({ errno: 'EACCES' }), 'permisos_red_local')
  assert.equal(motivoDeFalloRed({ errno: 'EPERM' }), 'permisos_red_local')
  assert.equal(motivoDeFalloRed({ errno: 'ECONNREFUSED' }), 'impresora_apagada')
  assert.equal(motivoDeFalloRed({ errno: 'ETIMEDOUT' }), 'otro')
})

test('el comando manual de la cola CUPS usa la URI real del destino', () => {
  assert.equal(comandoColaLan('MobOS_LAN', 'lan:192.168.1.23:9100'), 'sudo lpadmin -p MobOS_LAN -E -v socket://192.168.1.23:9100 -m raw')
  assert.equal(comandoColaLan('MobOS_LAN', 'lan:192.168.1.23'), 'sudo lpadmin -p MobOS_LAN -E -v socket://192.168.1.23:9100 -m raw', 'sin puerto vale 9100')
  assert.equal(comandoColaLan('MobOS_LAN', 'usb:ZKP8008'), '', 'una cola USB no genera comando LAN')
  assert.equal(comandoColaLan('MobOS_LAN', ''), '')
})

test('enviarLan cae al intento sin bind cuando el alias no está en la máquina', async () => {
  const error = await enviarLan(SIN_RESPUESTA, [0x1b, 0x40], { alias: ALIAS_AUSENTE, timeoutMs: 300 }).then(() => null, (cause) => cause)
  assert.ok(error, 'sin impresora en TEST-NET-1 el envío falla')
  assert.doesNotMatch(error.message, /EADDRNOTAVAIL/, 'no se queda con el error de bind: probó sin bind')
})

test('el sondeo TCP también cae sin bind si el alias no es local', async () => {
  const detalle = await probarConexionDetalle(SIN_RESPUESTA, { alias: ALIAS_AUSENTE, timeoutMs: 300 })
  assert.equal(detalle.ok, false)
  assert.notEqual(detalle.errno, 'EADDRNOTAVAIL', 'el sondeo no reporta un fallo de bind')
  assert.equal(detalle.origen, '', 'el intento final sale sin origen fijado')
})
