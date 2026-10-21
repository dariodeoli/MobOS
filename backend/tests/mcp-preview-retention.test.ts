export {}
const assert = require('node:assert/strict')
const { retentionBatchLimit, withoutMcpImageBytes } = require('../lib/mcp/preview-retention')
assert.equal(retentionBatchLimit(), 100)
assert.equal(retentionBatchLimit(200), 200)
for (const value of [0, -1, 201, 1.5, NaN, Infinity, '100', null]) assert.throws(() => retentionBatchLimit(value), /invalid_retention_batch/)
assert.deepEqual(withoutMcpImageBytes({ productId: 'p', contentType: 'image/png', dataBase64: 'sensitive' }), { productId: 'p', contentType: 'image/png' })
console.log('MCP preview retention bounds/scrub: PASS')

async function failClosed() {
  const { pruneMcpImagePreviews } = require('../lib/mcp/preview-retention')
  let entered = false
  await assert.rejects(pruneMcpImagePreviews({ $transaction: async () => { entered = true; throw new Error('unexpected') } }, { limit: 201 }), /invalid_retention_batch/)
  assert.equal(entered, false)
  await assert.rejects(pruneMcpImagePreviews({ $transaction: async () => { throw new Error('database unavailable') } }), /database unavailable/)
}
failClosed().catch(error => { console.error(error); process.exitCode = 1 })
