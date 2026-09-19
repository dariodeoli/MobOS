import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeActionToken, extractTokenFromUrl } from './actionToken.js'

test('reads an action token from the fragment and scrubs history immediately', () => {
  const token = 'ab'.repeat(32)
  const calls = []
  const history = { state: { preserved: true }, replaceState: (...args) => calls.push(args) }
  const result = consumeActionToken({ pathname: '/aceptar-invitacion', search: '?source=email', hash: `#token=${token}` }, history)
  assert.equal(result, token)
  assert.deepEqual(calls, [[history.state, '', '/aceptar-invitacion?source=email']])
})

test('reads an action token from the path and scrubs history immediately', () => {
  const token = 'ef'.repeat(32)
  const calls = []
  const history = { state: { preserved: true }, replaceState: (...args) => calls.push(args) }
  const result = consumeActionToken({ pathname: `/aceptar-invitacion/${token}`, search: '', hash: '' }, history)
  assert.equal(result, token)
  assert.deepEqual(calls, [[history.state, '', '/aceptar-invitacion/']])
})

test('accepts a legacy query token for compatibility and removes it from browser history', () => {
  const token = 'cd'.repeat(32)
  const calls = []
  const history = { state: null, replaceState: (...args) => calls.push(args) }
  const result = consumeActionToken({ pathname: '/verificar-correo', search: `?token=${token}&source=email`, hash: '' }, history)
  assert.equal(result, token)
  assert.deepEqual(calls, [[null, '', '/verificar-correo?source=email']])
})

test('rejects malformed tokens', () => {
  const history = { state: null, replaceState: () => {} }
  assert.equal(consumeActionToken({ pathname: '/x', search: '', hash: '#token=zzzz' }, history), '')
})

test('extrae el token de un enlace envuelto por el tracker del relay', () => {
  // El tracker codifica la dirección (%2F) y agrega ids largos: sin decodificar
  // primero, el `2F` se pegaba al token y quedaba corrido dos caracteres.
  const token = '249ba16df86551ca62edbe1055699ce5a46f538577255a7151a8e55b3fbb2242'
  const envuelto = `https://track.weem.com.py/CL0/https:%2F%2Fapp.moboss.online%2Faceptar-invitacion%2F${token}/1/010301a0b8c061bb-9df97937-4967-4450-9e7a-252ffaad4f71-000000/hkQXyXA48H7ybFFQiF3jyPj4XykTgfvVMnaIT2WpOhk=258`
  assert.equal(extractTokenFromUrl(envuelto), token)
  // Un enlace sin token sigue devolviendo vacío.
  assert.equal(extractTokenFromUrl('https://track.weem.com.py/CL0/https:%2F%2Fapp.moboss.online%2Flogin/1/abc'), '')
})
