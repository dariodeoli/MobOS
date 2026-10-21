export {}
const assert = require('node:assert/strict')
const { readBoundedBody } = require('../lib/mcp/request-body')
async function run() {
  const request = (body: any) => new Request('https://mcp.example.test/', { method: 'POST', body, duplex: 'half' } as any)
  assert.equal(await readBoundedBody(request('abcd'), 4), 'abcd')
  assert.equal(await readBoundedBody(request('abcde'), 4), null)
  let cancelled = false
  const never = new ReadableStream({ start() {}, cancel() { cancelled = true; return new Promise(() => {}) } })
  await assert.rejects(readBoundedBody(request(never), 10, 20), /request_body_timeout/)
  assert.equal(cancelled, true)
  console.log('MCP body byte limit/deadline: PASS')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
