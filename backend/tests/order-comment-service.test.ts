export {}
const assert = require('node:assert/strict')
const { normalizeOrderCommentFields } = require('../lib/order-comment-service')
assert.deepEqual(normalizeOrderCommentFields({ notes: '  Llamar mañana  ' }), { notes: 'Llamar mañana' })
assert.deepEqual(normalizeOrderCommentFields({ notes: 'Nota', billingName: 'Titular', billingDocument: '80000000-1' }), { notes: 'Nota', billingName: 'Titular', billingDocument: '80000000-1' })
for (const notes of ['', '   ', 'x'.repeat(2001), null, 123]) assert.throws(() => normalizeOrderCommentFields({ notes }))
assert.throws(() => normalizeOrderCommentFields({ totalPyg: 1 }))
console.log('shared order comment fields: ok')
