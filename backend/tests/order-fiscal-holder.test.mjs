import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
class PricingError extends Error {}
const raw = '  Separate Holder, S.A.  '
let buyer, holder, saved, writes
const reset = () => {
  buyer = { id: 'buyer', tenantId: 'tenant-a', nameOfficial: 'CUSTOMER OFFICIAL', name: 'Legacy buyer', billingName: raw, billingDocument: '80069563-1', pricingTier: 'RETAIL', priceListId: null }
  holder = { id: 'holder', tenantId: 'tenant-a', customerId: 'buyer', name: raw, document: '80069563-1' }
  saved = null; writes = []
}
reset()
const prisma = {
  tenant: { findUnique: async () => ({ belowListPct: 0, insurancePct: 0, loyaltyPct: 0 }) },
  customer: {
    findFirst: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return where.id === 'buyer' ? buyer : null },
    update: async ({ where, data }) => { assert.equal(where.tenantId, 'tenant-a'); writes.push(['customer', data]); buyer = { ...buyer, ...data }; return buyer },
  },
  customerBillingIdentity: {
    findFirst: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); assert.equal(where.customerId, 'buyer'); return holder && (!where.name || where.name === holder.name) && where.document === holder.document ? holder : null },
    create: async ({ data }) => { if (holder?.document === data.document) throw new Error('duplicate document'); writes.push(['holder-create', data]); holder = { id: 'holder', ...data }; return holder },
    update: async ({ where, data }) => { assert.equal(where.tenantId, 'tenant-a'); assert.equal(where.customerId, 'buyer'); writes.push(['holder-update', data]); holder = { ...holder, ...data }; return holder },
    upsert: async ({ update, create }) => { writes.push(['holder-upsert', holder ? update : create]); holder = holder ? { ...holder, ...update } : { id: 'holder', ...create }; return holder },
  },
  order: {
    create: async ({ data }) => { writes.push(['order', data]); saved = { id: 'order-a', ...data }; return saved },
    findUnique: async () => null,
    findUniqueOrThrow: async () => saved,
  },
  orderItem: { findMany: async () => [] },
  orderAccessToken: { create: async () => {} },
  auditLog: { create: async () => {} },
  $transaction: async callback => callback(prisma),
}
const exports = {}
const modules = {
  'node:crypto': require('node:crypto'),
  '@prisma/client': { Prisma: { validator: () => value => value } },
  '../../../lib/prisma': { prisma },
  '../../../lib/customer-identity': {}, // Replaced below with the actual pure helper.
  '../../../lib/http': { tenantId: async () => 'tenant-a', json: (body, init = {}) => ({ body, status: init.status || 200 }), error: (message, status = 400) => ({ message, status }) },
  '../../../lib/auth': { requireSession: async () => ({ user: { id: 'user-a', role: 'ADMIN', tenantId: 'tenant-a' } }) },
  '../../../lib/payment-input': { InputError, objectInput: value => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Invalid object'); return value }, textInput: (value, label, max) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InputError('Invalid text'); return value.trim() } },
  '../../../lib/gift-cards': {}, '../../../lib/insurance': {}, '../../../lib/costs': {}, '../../../lib/promotions': {},
  '../../../lib/orders': { canApproveOrderDiscount: () => true },
  '../../../lib/authorizations': { DEFAULT_BELOW_LIST_PCT: 0 },
  '../../../lib/rate-limit': { enforceRateLimit: () => null }, '../../../lib/validation': {},
  '../../../lib/pricing': { PricingError, lineDiscount: ({ quantity, unitPricePyg }) => ({ discountPyg: 0, totalPyg: quantity * unitPricePyg }) },
  '../../../lib/stock': {}, '../../../lib/supply-demand': { demandasDePedido: () => [], crearDemandas: async () => {}, revisarMinimoDeStock: async () => {} },
  '../../../lib/order-serials': { syncOrderItemSerials: async () => {} },
  '../../../lib/order-number': { esCodigoDuplicado: () => false, nextOrderNumber: async () => 'MOB #TEST' },
  '../../../lib/montos': { LIMITE_MONTO_GENERAL: 1_000_000, LIMITE_MONTO_VENTAS: 1_000_000, numero: Number },
  '../../../lib/sucursal-efectiva': { sucursalEfectiva: async () => null },
}
function load(path, target, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports: target, Date, Set, URL, require: name => { if (!Object.hasOwn(dependencies, name)) throw new Error(`Unmocked import ${name}`); return dependencies[name] } })
}
load('../lib/customer-identity.ts', modules['../../../lib/customer-identity'], {})
load('../app/api/orders/route.ts', exports, modules)
const body = billingTo => ({ customerId: 'buyer', items: [{ description: 'Manual item', quantity: 1, unitPricePyg: 100 }], ...(billingTo === undefined ? {} : { billingTo }) })
const post = billingTo => exports.POST({ headers: { get: () => null }, json: async () => body(billingTo) })
// Exact existing holder must be reused, not normalized or rewritten.
let result = await post({ name: raw, document: '80069563-1' })
assert.equal(result.status, 201, result.message)
assert.equal(saved.billingName, raw)
assert.equal(buyer.billingName, raw)
assert.equal(holder.name, raw)
assert.ok(!writes.some(([kind, data]) => kind.startsWith('holder') && Object.hasOwn(data, 'name')), 'existing holder name must not be rewritten')
reset()
// A different name for an already saved holder requires explicit identity editing.
result = await post({ name: 'Altered Holder', document: '80069563-1' })
assert.equal(result.status, 409)
assert.equal(holder.name, raw)
assert.equal(writes.length, 0)
reset()
result = await post(undefined)
assert.equal(result.status, 201, result.message)
assert.equal(buyer.billingName, raw)
assert.equal(holder.name, raw)
assert.equal(saved.billingName, undefined)
assert.equal(writes.filter(([kind]) => kind === 'customer' || kind.startsWith('holder')).length, 0)
reset()
holder = null
const longName = `  ${'Holder, S.A. '.repeat(25)}  `
result = await post({ name: longName, document: '80069563-1' })
assert.equal(result.status, 201, result.message)
assert.equal(saved.billingName, longName)
assert.equal(holder.name, longName)
for (const name of [' ', 'X'.repeat(2001)]) {
  reset()
  result = await post({ name, document: '80069563-1' })
  assert.equal(result.status, 400)
  assert.equal(writes.length, 0)
}
console.log('Orders real POST mocked fiscal-holder regressions OK (raw text, no overwrite, omission, long name, rejection)')

for (const partial of [{ name: 'Different Holder' }, { document: '80012345-0' }]) {
  reset()
  result = await post(partial)
  assert.equal(result.status, 409)
  assert.equal(writes.length, 0, 'partial input cannot reassociate an existing holder')
}
reset()
result = await post({ document: '80069563-1' })
assert.equal(result.status, 201, result.message)
assert.equal(buyer.billingName, raw)
assert.equal(holder.name, raw)
assert.equal(saved.billingName, undefined)
assert.ok(!writes.some(([kind]) => kind.startsWith('holder')))
console.log('Orders partial-holder omission and association guards OK')
