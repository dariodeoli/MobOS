import assert from 'node:assert/strict'
import test from 'node:test'
import { ESTADO_IMPRESORA, agregarEstado, estadoDeDiagnostico, motivoDeDiagnostico, textoVerificacion } from './estadoImpresoras.js'

const impresora = (id, cambios = {}) => ({ id, nombre: `Impresora ${id}`, destino: `lan:10.0.0.${id.length}:9100`, activa: true, ...cambios })
const registro = (estado, cambios = {}) => ({ estado, fecha: 1_000, motivo: '', ...cambios })

test('sin impresoras el agregado queda sin verificar, no en verde', () => {
  const agregado = agregarEstado([], {})
  assert.equal(agregado.estado, 'sin-verificar')
  assert.equal(agregado.label, 'Sin verificar')
  assert.equal(agregado.tono, 'slate')
  assert.equal(agregado.total, 0)
  assert.equal(agregado.detalle, 'Sin impresoras activas')
})

test('todas las activas ok dan listo para imprimir', () => {
  const impresoras = [impresora('a'), impresora('b')]
  const agregado = agregarEstado(impresoras, { a: registro(ESTADO_IMPRESORA.OK), b: registro(ESTADO_IMPRESORA.OK) })
  assert.equal(agregado.estado, 'listo')
  assert.equal(agregado.label, 'Listo para imprimir')
  assert.equal(agregado.tono, 'ok')
  assert.equal(agregado.ok, 2)
  assert.equal(agregado.detalle, '2 de 2 listas')
})

test('una sola impresora con error marca con problemas aunque el resto esté ok', () => {
  const impresoras = [impresora('a'), impresora('b')]
  const agregado = agregarEstado(impresoras, { a: registro(ESTADO_IMPRESORA.OK), b: registro(ESTADO_IMPRESORA.ERROR, { motivo: 'La impresora no está en esta red' }) })
  assert.equal(agregado.estado, 'con-problemas')
  assert.equal(agregado.label, 'Con problemas')
  assert.equal(agregado.tono, 'bad')
  assert.equal(agregado.error, 1)
  assert.equal(agregado.detalle, '1 de 2 sin respuesta')
})

test('mezcla de ok y sin verificar no se declara lista', () => {
  const impresoras = [impresora('a'), impresora('b')]
  const agregado = agregarEstado(impresoras, { a: registro(ESTADO_IMPRESORA.OK), b: registro(ESTADO_IMPRESORA.VERIFICANDO) })
  assert.equal(agregado.estado, 'sin-verificar')
  assert.equal(agregado.ok, 1)
  assert.equal(agregado.sinVerificar, 1)
  assert.equal(agregado.detalle, '1 de 2 sin verificar')
})

test('las impresoras inactivas no cuentan en el agregado', () => {
  const impresoras = [impresora('a'), impresora('b', { activa: false })]
  const agregado = agregarEstado(impresoras, { a: registro(ESTADO_IMPRESORA.OK), b: registro(ESTADO_IMPRESORA.ERROR) })
  assert.equal(agregado.total, 1)
  assert.equal(agregado.error, 0)
  assert.equal(agregado.estado, 'listo')
})

test('estadoDeDiagnostico: TCP alcanzable, cola CUPS con URI y fallos', () => {
  assert.equal(estadoDeDiagnostico({ alcance: true }), ESTADO_IMPRESORA.OK)
  assert.equal(estadoDeDiagnostico({ metodo: 'CUPS', cupsUri: 'usb://ZKTeco/ZKP8008' }), ESTADO_IMPRESORA.OK)
  assert.equal(estadoDeDiagnostico({ metodo: 'CUPS', cupsUri: '' }), ESTADO_IMPRESORA.ERROR)
  assert.equal(estadoDeDiagnostico({ alcance: false, error: 'EHOSTUNREACH 10.0.0.5:9100' }), ESTADO_IMPRESORA.ERROR)
  assert.equal(estadoDeDiagnostico({ ok: false, error: 'Token inválido.' }), ESTADO_IMPRESORA.ERROR)
  assert.equal(estadoDeDiagnostico(null), ESTADO_IMPRESORA.ERROR)
})

test('motivoDeDiagnostico traduce los códigos y cae al error real', () => {
  assert.equal(motivoDeDiagnostico({ motivo: 'red_cambiada' }), 'La impresora no está en esta red')
  assert.equal(motivoDeDiagnostico({ motivo: 'permisos_red_local' }), 'macOS bloqueó la salida a la red local')
  assert.equal(motivoDeDiagnostico({ motivo: 'permiso_o_red' }), 'Puede faltar el permiso de Red Local de macOS')
  assert.equal(motivoDeDiagnostico({ motivo: 'impresora_apagada' }), 'La impresora rechazó la conexión')
  assert.equal(motivoDeDiagnostico({ error: 'ETIMEDOUT 10.0.0.5:9100' }), 'ETIMEDOUT 10.0.0.5:9100')
  assert.equal(motivoDeDiagnostico({ metodo: 'CUPS', cupsUri: '' }), 'La cola CUPS no existe en esta computadora')
  assert.equal(motivoDeDiagnostico(null), 'El agente no respondió')
})

test('textoVerificacion informa segundos, motivo o falta de datos', () => {
  assert.equal(textoVerificacion(registro(ESTADO_IMPRESORA.OK, { fecha: 60_000 }), 65_000), 'Verificada hace 5 s')
  assert.equal(textoVerificacion(registro(ESTADO_IMPRESORA.ERROR, { motivo: 'La impresora rechazó la conexión' }), 65_000), 'Sin respuesta: La impresora rechazó la conexión')
  assert.equal(textoVerificacion(registro(ESTADO_IMPRESORA.VERIFICANDO)), 'Verificando…')
  assert.equal(textoVerificacion(registro(ESTADO_IMPRESORA.SIN_VERIFICAR)), 'Sin verificar')
  assert.equal(textoVerificacion(null), 'Sin verificar')
})
