const test = require('node:test')
const assert = require('node:assert/strict')
const { buildInvoicePayload, InvoicePayloadError } = require('../lib/external-invoices/contracts.ts')
const { configuredInvoiceProvider, invoiceIdempotencyKey, SimulatedInvoiceProvider } = require('../lib/external-invoices/providers.ts')

const order = {
  id: 'order-1', orderNumber: 'MOB-1001', subtotalPyg: 2300000n, discountPyg: 0n, deliveryPyg: 0n, totalPyg: 2300000n,
  billingName: null, billingDocument: null,
  items: [{ description: 'Teléfono', quantity: 2, unitPricePyg: 1150000n, totalPyg: 2300000n }],
}
const customer = {
  name: 'Ana Cliente', document: '80012345-6', email: 'ANA@example.com', phone: '+595 981 000000',
  addresses: [{ address: 'Av. Centro 123', city: 'Asunción', department: 'Central', isDefault: true }],
}

test('builds provider payload from billing identity, customer contact and order lines', () => {
  const payload = buildInvoicePayload({ order, customer })
  assert.deepEqual(payload.customer, { name: 'Ana Cliente', ruc: '80012345-6', address: 'Av. Centro 123, Asunción, Central', email: 'ana@example.com', phone: '+595 981 000000' })
  assert.deepEqual(payload.lines, [{ description: 'Teléfono', quantity: 2, unitPricePyg: 1150000, totalPyg: 2300000 }])
  assert.equal(payload.order.totalPyg, 2300000)
  assert.equal(payload.order.subtotalPyg - payload.order.discountPyg + payload.order.deliveryPyg, payload.order.totalPyg)
})

test('billing name and RUC on the order override the customer defaults', () => {
  const payload = buildInvoicePayload({ order: { ...order, billingName: 'Empresa SA', billingDocument: '80099999-1' }, customer })
  assert.equal(payload.customer.name, 'Empresa SA')
  assert.equal(payload.customer.ruc, '80099999-1')
})

test('requires billing name, RUC and at least one valid line', () => {
  assert.throws(() => buildInvoicePayload({ order, customer: { ...customer, document: '' } }), InvoicePayloadError)
  assert.throws(() => buildInvoicePayload({ order: { ...order, items: [] }, customer }), InvoicePayloadError)
  assert.throws(() => buildInvoicePayload({ order: { ...order, items: [{ ...order.items[0], quantity: 0 }] }, customer }), InvoicePayloadError)
})

test('rejects unsafe integer amounts instead of silently rounding guaranies', () => {
  assert.throws(() => buildInvoicePayload({ order: { ...order, totalPyg: BigInt(Number.MAX_SAFE_INTEGER) + 1n }, customer }), InvoicePayloadError)
})

test('idempotency key is stable per tenant, order and provider and isolated across tenants', () => {
  const key = invoiceIdempotencyKey('tenant-a', 'order-1', 'simulated')
  assert.equal(key, invoiceIdempotencyKey('tenant-a', 'order-1', 'simulated'))
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.notEqual(key, invoiceIdempotencyKey('tenant-b', 'order-1', 'simulated'))
})

test('simulator returns same provider reference for retries and never claims fiscal issuance', async () => {
  const provider = new SimulatedInvoiceProvider()
  const payload = buildInvoicePayload({ order, customer })
  const first = await provider.issue(payload, 'key-1')
  const second = await provider.issue(payload, 'key-1')
  assert.deepEqual(second, first)
  assert.equal(first.simulated, true)
  assert.equal(first.documentNumber, null)
  assert.equal(first.documentUrl, null)
  assert.equal(configuredInvoiceProvider({ NODE_ENV: 'production', MOBOS_EXTERNAL_INVOICE_PROVIDER: 'simulated' }), null)
  assert.equal(configuredInvoiceProvider({ NODE_ENV: 'test', MOBOS_EXTERNAL_INVOICE_PROVIDER: 'simulated' })?.id, 'simulated')
  assert.equal(configuredInvoiceProvider({ NODE_ENV: 'test' }), null)
})
