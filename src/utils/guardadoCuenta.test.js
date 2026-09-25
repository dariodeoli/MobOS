import assert from 'node:assert/strict'
import test from 'node:test'
import { esReautenticacionRequerida, mensajeDeErrorDeGuardado, mensajeDeGuardado } from './guardadoCuenta.js'

// Configuración · guardado transversal (#162 · lote F): el estado que ve el
// usuario distingue «falta la contraseña» de un error real de datos.

test('detecta el 403 de reautenticación y no otros errores', () => {
  assert.equal(esReautenticacionRequerida({ status: 403, message: 'Reautenticá tu contraseña para continuar.' }), true)
  assert.equal(esReautenticacionRequerida({ status: 403, message: 'Reautenticá tu contraseña antes de exportar.' }), true)
  assert.equal(esReautenticacionRequerida({ status: 403, message: 'Solo el dueño puede administrar la cuenta.' }), false)
  assert.equal(esReautenticacionRequerida({ status: 400, message: 'El nombre es inválido.' }), false)
  assert.equal(esReautenticacionRequerida(new Error('No se pudo conectar.')), false)
  assert.equal(esReautenticacionRequerida(undefined), false)
})

test('el mensaje de error explica que falta la contraseña y conserva los errores de datos', () => {
  assert.match(mensajeDeErrorDeGuardado({ status: 403, message: 'Reautenticá tu contraseña para continuar.' }), /Falta verificar tu contraseña/)
  assert.equal(mensajeDeErrorDeGuardado({ status: 400, message: 'El RUC de la empresa es inválido.' }), 'El RUC de la empresa es inválido.')
  assert.equal(mensajeDeErrorDeGuardado(undefined, 'No se pudo guardar el seguro.'), 'No se pudo guardar el seguro.')
})

test('el texto de éxito incluye el detalle cuando lo hay', () => {
  assert.equal(mensajeDeGuardado(), 'Guardado.')
  assert.equal(mensajeDeGuardado('25% del costo'), 'Guardado: 25% del costo.')
})
