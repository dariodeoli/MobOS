export {}
const assert = require('node:assert/strict')
const { consumeMcpQuota, mcpAccessFailure, McpAccessError } = require('../lib/mcp/rate-limit')
async function run() {
  const saved = process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT
  try {
    for (const invalid of ['', '0', '-1', 'NaN', 'Infinity', '1.5']) {
      process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = invalid
      let calls = 0
      await assert.rejects(consumeMcpQuota({ $transaction: () => { calls++; throw new Error('must not enter') } }, 'grant', 'tenant'), (error: any) => error.status === 503)
      assert.equal(calls, 0)
    }
    process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = '120'
    await assert.rejects(consumeMcpQuota({ $transaction: () => { throw new Error('postgres password secret') } }, 'grant', 'tenant'), (error: any) => error.status === 503 && error.message === 'mcp_unavailable')
    const limited = mcpAccessFailure(new McpAccessError('mcp_rate_limited', 429, 60))
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60')
    const unavailable = mcpAccessFailure(new Error('provider password secret'))
    assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { error: 'mcp_unavailable' })
  } finally { if (saved === undefined) delete process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT; else process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = saved }
}
run().then(() => console.log('mcp rate limit: ok')).catch((error: unknown) => { console.error(error); process.exitCode = 1 })
