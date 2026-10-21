export {}
const assert = require('node:assert/strict')
const { validateChange, changePayloadHash } = require('../lib/mcp/changes')

assert.equal(validateChange('products.write', { name: 'Cable', sku: 'CAB-1', pricePyg: 70000 }).ok, true)
assert.equal(validateChange('products.write', { name: '', sku: 'CAB-1' }).ok, false)
assert.equal(validateChange('prices.write', { productId: 'p1', pricePyg: -1 }).ok, false)
assert.equal(validateChange('customers.write', { name: 'Dario', email: 'dario@example.com' }).ok, true)
assert.equal(validateChange('company.write', {}).ok, false)
assert.equal(validateChange('product_images.write', { productId: 'p1', contentType: 'image/png', dataBase64: 'iVBORw0KGgoAAAANSUhEUg==' }).ok, true)
assert.equal(changePayloadHash('company.write', { email: 'a', name: 'b' }), changePayloadHash('company.write', { name: 'b', email: 'a' }))
assert.notEqual(changePayloadHash('company.write', { name: 'a' }), changePayloadHash('company.write', { name: 'b' }))
assert.equal(validateChange('sales.write', { operation: 'update_note', orderId: 'o1', notes: 'Llamar al cliente' }).ok, true)
assert.equal(validateChange('sales.write', { operation: 'create', orderId: 'o1', notes: 'Nota' }).ok, false)
assert.equal(validateChange('sales.write', { operation: 'update_note', orderId: 'o1', notes: 'Nota', totalPyg: 1 }).ok, false)
console.log('mcp change validation tests: ok')

assert.equal(validateChange('company.write', { name: 'Company', unexpected: 'secret' }).ok, false)
assert.equal(validateChange('prices.write', { productId: 'p', pricePyg: 2, expectedPricePyg: 1, stock: 99 }).ok, false)
