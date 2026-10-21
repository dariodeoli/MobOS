export {}
const assert = require('node:assert/strict')
const { toolInputSchema, invalidToolArguments, decodeToolCursor } = require('../lib/mcp/tool-contracts')
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
for (const action of ['customers.write', 'company.write']) {
  const schema = toolInputSchema(action)
  assert.ok(schema.properties.idempotencyKey, `${action} must permit its required idempotency key`)
  for (const key of schema.required) assert.ok(schema.properties[key], `required ${key} has a schema`)
}
assert.equal(invalidToolArguments('customers.write', { mode: 'preview', name: 'Cliente', idempotencyKey: 'request-123' }), null)
assert.equal(invalidToolArguments('company.write', { mode: 'preview', name: 'Empresa', idempotencyKey: 'request-123' }), null)
assert.ok(invalidToolArguments('customers.write', { mode: 'preview', name: 'Cliente' }))
assert.ok(invalidToolArguments('company.write', { mode: 'preview', name: 'Empresa', idempotencyKey: 123 }))
assert.ok(invalidToolArguments('prices.write', { mode: 'preview', pricePyg: 0.5, idempotencyKey: 'request-123' }))
assert.ok(invalidToolArguments('products.read', { limit: Infinity }))
assert.ok(invalidToolArguments('company.read', { q: 'ignored before' }))
assert.ok(invalidToolArguments('sales.read', { from: '2026-01-01' }))
assert.ok(invalidToolArguments('reports.read', { limit: 10 }))
assert.ok(invalidToolArguments('reports.read', { from: '2026-02-30' }))
assert.equal(invalidToolArguments('reports.read', { from: '2026-02-28' }), null)
for (const value of [[], {}, { id: 1, name: 'x' }, { id: 'x', name: 'x', tenantId: 'other' }, { id: 'x', createdAt: 'bad' }]) {
  assert.equal(decodeToolCursor('sales.read', encode(value)), null)
}
assert.deepEqual(decodeToolCursor('products.read', encode({ name: 'Cable', id: 'p1' })), { name: 'Cable', id: 'p1' })
assert.deepEqual(decodeToolCursor('price_lists.read', encode({ id: 'l1' })), { id: 'l1' })
assert.equal(decodeToolCursor('price_lists.read', encode({ id: 'l1', name: 'wrong tool' })), null)
assert.equal(decodeToolCursor('sales.read', encode({ id: 'o1', createdAt: '2026-02-30T00:00:00.000Z' })), null)
assert.deepEqual(decodeToolCursor('sales.read', encode({ id: 'o1', createdAt: '2026-02-28T00:00:00.000Z' })), { id: 'o1', createdAt: '2026-02-28T00:00:00.000Z' })
console.log('mcp tool contracts: ok')
