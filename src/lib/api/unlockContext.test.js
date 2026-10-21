import assert from 'node:assert/strict'
import test from 'node:test'
import { mismoContextoDeDesbloqueo } from './unlockContext.js'

const expected = { id: 'seller', tenantId: 'tenant', branchId: 'branch', role: 'VENDEDOR', permissions: ['pos:use', 'orders:own'], pinLength: 4 }
test('unlock only resumes the same identity, scope and effective permissions', () => {
  assert.equal(mismoContextoDeDesbloqueo(expected, { ...expected, permissions: [...expected.permissions].reverse() }), true)
  for (const change of [{ id: 'other' }, { tenantId: 'other' }, { branchId: 'other' }, { role: 'ADMIN' }, { permissions: ['*'] }, { permissions: [] }, { pinLength: 6 }, { permissions: null }]) {
    assert.equal(mismoContextoDeDesbloqueo(expected, { ...expected, ...change }), false)
  }
  assert.equal(mismoContextoDeDesbloqueo(null, expected), false)
  assert.equal(mismoContextoDeDesbloqueo(expected, {}), false)
})
