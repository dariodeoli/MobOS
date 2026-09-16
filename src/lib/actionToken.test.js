import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeActionToken } from './actionToken.js'

test('reads an action token from the fragment and scrubs history immediately', () => {
  const token = 'ab'.repeat(32)
  const calls = []
  const history = { state: { preserved: true }, replaceState: (...args) => calls.push(args) }
  const result = consumeActionToken({ pathname: '/aceptar-invitacion', search: '?source=email', hash: `#token=${token}` }, history)
  assert.equal(result, token)
  assert.deepEqual(calls, [[history.state, '', '/aceptar-invitacion?source=email']])
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
