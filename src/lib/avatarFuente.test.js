import assert from 'node:assert/strict'
import test from 'node:test'
import { fuenteAvatar } from './avatarFuente.js'

// #271: nunca pintar una foto que no sea la del usuario actual, ni adelantar la
// de Google mientras la local resuelve.
test('la foto local manda, pero solo la del usuario actual', () => {
  assert.deepEqual(
    fuenteAvatar({ foto: { id: 'u1', url: 'data:local-u1' }, usuarioId: 'u1', localListo: true, picture: 'https://google/u1.jpg' }),
    { tipo: 'foto', src: 'data:local-u1' },
  )
  // Cambió el usuario: la foto del anterior no se reusa (ni la local ni Google).
  assert.deepEqual(
    fuenteAvatar({ foto: { id: 'u1', url: 'data:local-u1' }, usuarioId: 'u2', localListo: false, picture: 'https://google/u2.jpg' }),
    { tipo: 'iniciales', src: '' },
  )
})

test('Google entra recién cuando la local se descartó', () => {
  assert.deepEqual(fuenteAvatar({ usuarioId: 'u1', localListo: false, picture: 'https://google/u1.jpg' }), { tipo: 'iniciales', src: '' })
  assert.deepEqual(fuenteAvatar({ usuarioId: 'u1', localListo: true, picture: 'https://google/u1.jpg' }), { tipo: 'google', src: 'https://google/u1.jpg' })
})

test('sin foto local resuelta ni Google quedan las iniciales', () => {
  assert.deepEqual(fuenteAvatar({ usuarioId: 'u1', localListo: true }), { tipo: 'iniciales', src: '' })
  assert.deepEqual(fuenteAvatar({}), { tipo: 'iniciales', src: '' })
  assert.deepEqual(fuenteAvatar(), { tipo: 'iniciales', src: '' })
})

test('una foto de Google rota cae a iniciales aunque la local esté resuelta', () => {
  assert.deepEqual(fuenteAvatar({ usuarioId: 'u1', localListo: true, picture: 'https://google/rota.jpg', googleRota: true }), { tipo: 'iniciales', src: '' })
})
