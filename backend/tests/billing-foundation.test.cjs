// Isolated use of the existing run-unit.cjs TypeScript transpilation convention.
const ts = require('typescript')
const fs = require('node:fs')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const policy = () => require('../lib/billing/commercial-policy.ts')
const enrollment = { tenantId: 'tenant-example', trialStartedAt: '2026-01-01T00:00:00.000Z', immutable: true }
const principal = { source: 'verified-server-session', subject: 'owner-subject', authenticated: true, emailVerified: true, email: 'dariodeoli@gmail.com' }
const price = { priceId: 'approved-provider-price', currency: 'PYG', amount: 99000, interval: 'month' }

test('approved proposals contain prices, not live catalog or quotas', () => {
  assert.deepEqual(policy().MONTHLY_PRICE_PROPOSALS, [99000, 199000, 349000])
  assert.ok(Object.isFrozen(policy().MONTHLY_PRICE_PROPOSALS))
  for (const monthlyPyg of policy().MONTHLY_PRICE_PROPOSALS) {
    const input = { enrollment, nowMs: Date.parse('2026-01-31T00:00:00.000Z'), monthlyPyg, founders: true }
    assert.equal(policy().quoteCommercialPolicy({ ...input, paidMonths: 0 }).duePyg, monthlyPyg / 2)
    assert.equal(policy().quoteCommercialPolicy({ ...input, paidMonths: 1 }).duePyg, monthlyPyg)
  }
})
test('trial requires immutable enrollment; exact 30-day boundary and explicit now', () => {
  const { quoteCommercialPolicy: quote } = policy()
  assert.throws(() => quote({ enrollment: null, nowMs: 0, monthlyPyg: 99000, paidMonths: 0 }))
  assert.throws(() => quote({ enrollment: { ...enrollment, immutable: false }, nowMs: 0, monthlyPyg: 99000, paidMonths: 0 }))
  const input = { enrollment, monthlyPyg: 99000, paidMonths: 0, founders: true }
  const end = Date.parse('2026-01-31T00:00:00.000Z')
  assert.equal(quote({ ...input, nowMs: end - 1 }).phase, 'trial')
  assert.equal(quote({ ...input, nowMs: end - 1 }).duePyg, 0)
  assert.equal(quote({ ...input, nowMs: end }).duePyg, 49500)
  assert.equal(quote({ ...input, nowMs: end, paidMonths: 1 }).duePyg, 99000)
  assert.equal(quote({ ...input, nowMs: end, founders: false }).duePyg, 99000)
  assert.throws(() => quote({ ...input, nowMs: NaN }))
  assert.throws(() => quote({ ...input, nowMs: end, monthlyPyg: 100000 }))
  assert.throws(() => quote({ ...input, nowMs: end, paidMonths: -1 }))
  assert.throws(() => quote({ ...input, enrollment: { ...enrollment, trialStartedAt: 'invalid' }, nowMs: end }))
  assert.throws(() => quote({ ...input, nowMs: Date.parse(enrollment.trialStartedAt) - 1 }))
})
test('coupons authorize exact verified owner email independent of tenant role', () => {
  const { approveFirstMonthCoupon: approve } = policy()
  const input = { principal, price, provider: { firstInvoiceDiscount: true }, percent: 50 }
  assert.equal(approve(input).scope, 'first-paid-month')
  for (const role of ['tenant-owner', 'employee', 'viewer', undefined]) {
    assert.equal(approve({ ...input, principal: { ...principal, role } }).scope, 'first-paid-month')
  }
  assert.equal(approve({ ...input, principal: { ...principal, subject: 'another-authenticated-subject' } }).scope, 'first-paid-month')
  for (const untrusted of [null, { ownerEmail: 'dariodeoli@gmail.com' }, { ...principal, authenticated: false }, { ...principal, emailVerified: false }, { ...principal, source: 'browser' }, { ...principal, email: 'foreign@example.test' }, { ...principal, email: 'Dariodeoli@gmail.com' }, { ...principal, email: 'dariodeoli@gmail.com ' }, { ...principal, subject: '' }, { ...principal, subject: '   ' }, { ...principal, subject: null }, { ...principal, source: 'client' }, { ...principal, email: undefined }]) {
    assert.throws(() => approve({ ...input, principal: untrusted }))
  }
  assert.throws(() => approve({ ...input, provider: { firstInvoiceDiscount: false } }))
  assert.throws(() => approve({ ...input, provider: { discountedRecurringCatalog: true } }))
  assert.throws(() => approve({ ...input, price: { ...price, amount: 100000 } }))
  assert.throws(() => approve({ ...input, price: { ...price, currency: 'USD' } }))
  assert.throws(() => approve({ ...input, percent: 101 }))
})
test('coupon applies only after trial first paid month, never stacks with founders', () => {
  const p = policy()
  const coupon = p.approveFirstMonthCoupon({ principal, price, provider: { firstInvoiceDiscount: true }, percent: 20 })
  const input = { enrollment, nowMs: Date.parse('2026-01-31T00:00:00.000Z'), monthlyPyg: 99000, paidMonths: 0, coupon }
  assert.equal(p.quoteCommercialPolicy(input).duePyg, 79200)
  assert.equal(p.quoteCommercialPolicy({ ...input, paidMonths: 1 }).duePyg, 99000)
  assert.throws(() => p.quoteCommercialPolicy({ ...input, founders: true }))
  assert.throws(() => p.quoteCommercialPolicy({ ...input, monthlyPyg: 199000 }))
  assert.throws(() => p.quoteCommercialPolicy({ ...input, coupon: { ...coupon } }))
})
const adapter = () => import('../lib/billing/pagaya-server.mjs')
const clientOptions = { baseUrl: 'https://provider.example.test', apiKey: 'pk_test_synthetic' }
const uuid = '11111111-1111-4111-8111-111111111111'
test('adapter exact documented paths/headers/bodies; response remains opaque', async () => {
  const { createPagaYaClient } = await adapter()
  const calls = []
  const opaque = { synthetic: 'opaque fixture, not provider schema' }
  const client = createPagaYaClient({ ...clientOptions, fetch: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(opaque)) } })
  assert.deepEqual(await client.getCatalog(), opaque)
  await client.createCheckout({ syntheticInput: true }, 'command-001')
  await client.getCheckout(uuid)
  await client.getSubscription(uuid)
  await client.setRenewal(uuid, true, 'command-002')
  await client.createPortalSession(uuid)
  assert.deepEqual(calls.map(c => [c.url.replace(clientOptions.baseUrl, ''), c.init.method, c.init.body]), [
    ['/api/v1/catalog', 'GET', undefined], ['/api/v1/checkouts', 'POST', '{"syntheticInput":true}'],
    [`/api/v1/checkouts/${uuid}`, 'GET', undefined], [`/api/v1/subscriptions/${uuid}`, 'GET', undefined],
    [`/api/v1/subscriptions/${uuid}`, 'POST', '{"cancelAtPeriodEnd":true}'], [`/api/v1/subscriptions/${uuid}/portal`, 'POST', '{}'],
  ])
  assert.equal(calls[1].init.headers['Idempotency-Key'], 'command-001')
  assert.equal(calls[4].init.headers['Idempotency-Key'], 'command-002')
  assert.equal(calls[5].init.headers['Idempotency-Key'], undefined)
  for (const { init } of calls) {
    assert.equal(init.headers.Authorization, 'Bearer pk_test_synthetic')
    assert.equal(init.headers.Accept, 'application/json')
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error')
    assert.ok(init.signal instanceof AbortSignal)
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined)
  }
})
test('adapter validates idempotency/configuration locally and never retries writes', async () => {
  const { createPagaYaClient } = await adapter()
  let calls = 0
  const client = createPagaYaClient({ ...clientOptions, fetch: async () => { calls++; throw new Error('synthetic transport failure') } })
  for (const key of ['', 'short', 'bad key-01', 'a'.repeat(161)]) assert.throws(() => client.createCheckout({}, key))
  assert.throws(() => client.getCheckout('invalid'))
  assert.throws(() => client.setRenewal(uuid, 'true', 'command-001'))
  assert.equal(calls, 0)
  await assert.rejects(client.createCheckout({}, 'command-001'), e => e.code === 'transport_error' && e.outcomeUnknown)
  assert.equal(calls, 1)
  assert.throws(() => createPagaYaClient({ ...clientOptions, baseUrl: 'http://provider.example.test' }))
  assert.throws(() => createPagaYaClient({ ...clientOptions, apiKey: 'invalid' }))
  globalThis.window = {}
  try { assert.throws(() => createPagaYaClient(clientOptions)) } finally { delete globalThis.window }
})
test('adapter provider errors and malformed responses are not retried', async () => {
  const { createPagaYaClient } = await adapter()
  for (const [body, status, code] of [['{"error":"idempotency_conflict"}',409,'idempotency_conflict'], ['{"error":"unknown_private_error"}',503,'api_error'], ['not-json',200,'invalid_response']]) {
    let calls = 0
    const client = createPagaYaClient({ ...clientOptions, fetch: async () => { calls++; return new Response(body, { status, headers: { 'retry-after': '12' } }) } })
    await assert.rejects(client.createCheckout({}, 'command-001'), e => e.code === code && (status !== 503 || e.outcomeUnknown))
    assert.equal(calls, 1)
  }
})
test('webhook verifies original bytes, timestamps, whitespace and tampering', async () => {
  const { verifyPagaYaWebhook: verify } = await adapter()
  const raw = '{ "synthetic": true }\n', timestamp = 1767225600, secret = 'synthetic-only-secret'
  const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`
  const options = { nowMs: timestamp * 1000 }
  assert.equal(verify(raw, signature, secret, options), true)
  assert.equal(verify(Buffer.from(raw), signature, secret, options), true)
  assert.equal(verify(JSON.stringify(JSON.parse(raw)), signature, secret, options), false)
  assert.equal(verify(raw + ' ', signature, secret, options), false)
  assert.equal(verify(raw, signature, 'wrong', options), false)
  assert.equal(verify(raw, signature, secret, { nowMs: (timestamp + 301) * 1000 }), false)
  assert.equal(verify(raw, signature, secret, { nowMs: (timestamp - 301) * 1000 }), false)
  assert.equal(verify(raw, signature, secret, { nowMs: (timestamp + 300) * 1000 }), true)
  assert.equal(verify(raw, signature.replace('t=', 't=0'), secret, options), false)
})
