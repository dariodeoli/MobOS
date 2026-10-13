import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acceptedCustomerIdentity, customerIdentityPayload, customerDisplayName } from './customerIdentity.js'

const raw = '  PÉREZ, JUAN; S.A.  '
test('acceptance preserves exact official name without guessing person parts', () => {
  const form = acceptedCustomerIdentity({ firstName: 'Manual', identityKind: 'PERSON', givenNames: 'Old', surnames: 'Old', personConfirmed: true }, { nameOfficial: raw, fullRuc: '80012345-0' })
  assert.equal(form.nameOfficial, raw)
  assert.equal(form.firstName, 'Manual')
  assert.equal(form.identityKind, '')
  assert.equal(form.personConfirmed, false)
  assert.deepEqual(customerIdentityPayload(form), { nameOfficial: raw })
})
test('person display requires explicit reviewed parts, never provider guesses', () => {
  assert.equal(customerDisplayName({ name: raw, nameOfficial: raw }), raw)
  assert.equal(customerDisplayName({ name: raw, identityKind: 'COMPANY' }), raw)
  const form = { name: raw, identityKind: 'PERSON', givenNames: 'Juan Carlos', surnames: 'Pérez López', personConfirmed: true }
  assert.equal(customerDisplayName(customerIdentityPayload(form)), 'Juan Carlos Pérez López')
  assert.throws(() => customerIdentityPayload({ ...form, personConfirmed: false }))
  assert.throws(() => customerIdentityPayload({ ...form, surnames: 'Pérez, López' }))
})
test('official validation rejects rather than trims or truncates', () => {
  for (const nameOfficial of [' ', 'X'.repeat(2001), 1]) assert.throws(() => customerIdentityPayload({ nameOfficial }))
  assert.deepEqual(customerIdentityPayload({}), {})
})

test('company acceptance does not reorder or overwrite manually entered legacy names', () => {
  const form = acceptedCustomerIdentity({ firstName: 'Tienda', secondName: 'Local' }, { nameOfficial: raw, fullRuc: '80012345-0', givenNames: 'Provider guess', surnames: 'Provider guess' })
  assert.equal(form.firstName, 'Tienda')
  assert.equal(form.secondName, 'Local')
  assert.equal(form.givenNames, '')
  assert.equal(form.surnames, '')
  const data = customerIdentityPayload({ ...form, identityKind: 'COMPANY' })
  assert.deepEqual(data, { nameOfficial: raw, identityKind: 'COMPANY' })
  assert.equal(customerDisplayName({ name: 'Tienda Local', ...data }), 'Tienda Local')
})

// Wiring checks complement pure payload tests; they are not browser interaction proof.
test('seller and billing consumers carry raw identity without substituting display names', () => {
  const seller = readFileSync(new URL('../components/ventas/SellerCustomers.jsx', import.meta.url), 'utf8')
  assert.ok(seller.includes('acceptedCustomerIdentity(actual, datos)'))
  assert.ok(seller.includes('const identity = customerIdentityPayload(form)'))
  assert.equal((seller.match(/name: nombre, firstName, secondName, \.\.\.identity/g) || []).length, 2)
  assert.ok(seller.includes('name: row.name ||'))
  assert.ok(seller.includes('nameOfficial: row.nameOfficial ?? null'))
  const profile = readFileSync(new URL('../components/customers/CustomerProfile.jsx', import.meta.url), 'utf8')
  assert.ok(profile.includes('name: datos.nameOfficial ?? datos.name ?? form.name'))
  assert.ok(profile.includes('const name = identityForm.name\n'))
  assert.ok(!profile.includes('const name = identityForm.name.trim()'))
})
