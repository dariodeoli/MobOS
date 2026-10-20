import assert from 'node:assert/strict'

// PG/HTTP regression for #344: an inline POS customer must retain the exact
// provider name and reviewed person tuple when the order creates the record.
// Run against an isolated backend only: node tests/orders-inline-fiscal-identity.mjs BASE ADMIN_TOKEN
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
const suffix = Date.now().toString(36).toUpperCase()
async function post(path, body, expected = 200) {
  const response = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`)
  return data
}
const product = await post('/api/products', { sku: `RUC344-${suffix}`, name: 'RUC inline test', pricePyg: 1000, stock: 5, branchId: 'branch-a-it' }, 201)
const official = '  APELLIDO, NOMBRE; EMPRESA S.A.  '
const order = await post('/api/orders', {
  orderNumber: `RUC344-${suffix}`,
  customer: { name: 'Nombre visible POS', nameOfficial: official, identityKind: 'COMPANY', document: '80012345-0' },
  items: [{ productId: product.id, description: product.name, quantity: 1, unitPricePyg: 1000 }],
  payment: { method: 'CASH', amountPyg: 1000 },
}, 201)
assert.equal(order.customer.name, 'Nombre visible POS')
assert.equal(order.customer.nameOfficial, official)
assert.equal(order.customer.identityKind, 'COMPANY')
assert.equal(order.customer.document, '80012345-0')

const personOfficial = '  Pérez, Juan Carlos  '
const person = await post('/api/orders', {
  orderNumber: `RUC344-PERSON-${suffix}`,
  customer: { nameOfficial: personOfficial, identityKind: 'PERSON', givenNames: 'Juan Carlos', surnames: 'Pérez', document: '1234567-8' },
  items: [{ productId: product.id, description: product.name, quantity: 1, unitPricePyg: 1000 }],
  payment: { method: 'CASH', amountPyg: 1000 },
}, 201)
assert.equal(person.customer.name, 'Juan Carlos Pérez')
assert.equal(person.customer.nameOfficial, personOfficial)
assert.equal(person.customer.identityKind, 'PERSON')
assert.equal(person.customer.givenNames, 'Juan Carlos')
assert.equal(person.customer.surnames, 'Pérez')

console.log('PASS: inline POS preserves company/person fiscal identity in isolated PG · 10 checks')
