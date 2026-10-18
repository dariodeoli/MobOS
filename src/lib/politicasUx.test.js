import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeErrorPoliticas } from './politicasUx.js'

test('403 de políticas explica el límite de rol y conserva el contexto de sesión', () => {
  assert.match(mensajeErrorPoliticas({ status: 403, message: 'No autorizado.' }), /solo el dueño/i)
  assert.match(mensajeErrorPoliticas({ status: 403, message: 'Solo el dueño puede ver las políticas completas.' }), /sesión sigue activa/i)
  assert.match(mensajeErrorPoliticas({ status: 403 }, 'guardar'), /puede guardar/)
})

test('otros errores de políticas conservan el mensaje del servidor', () => {
  assert.equal(mensajeErrorPoliticas({ status: 401, message: 'Falta sesión.' }), 'Falta sesión.')
  assert.equal(mensajeErrorPoliticas({ status: 500, message: 'No se pudo guardar la política.' }, 'guardar'), 'No se pudo guardar la política.')
})
