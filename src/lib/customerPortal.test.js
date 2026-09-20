import test from 'node:test'
import assert from 'node:assert/strict'
import { portalUrlFor } from './customerPortal.js'

test('customer portal URLs use the dedicated public portal origin', () => {
  assert.equal(portalUrlFor('abc 123'), 'https://clientes.moboss.online/cuenta/abc%20123')
})

test('customer portal URLs require a token', () => {
  assert.equal(portalUrlFor(''), '')
})
