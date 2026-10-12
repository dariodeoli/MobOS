import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function load(path, modules = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports, URL, require: name => { if (!Object.hasOwn(modules, name)) throw new Error(`Unmocked import: ${name}`); return modules[name] } })
  return exports
}
const identity = load('../lib/customer-identity.ts')
const raw = '  PÉREZ, JUAN; S.A.  '
assert.equal(identity.customerIdentityInput({ nameOfficial: raw }).nameOfficial, raw)
assert.equal(JSON.stringify(identity.customerIdentityInput({})), '{}')
assert.equal(identity.customerIdentityInput({ nameOfficial: null }).nameOfficial, null)
for (const value of ['', '  ', 4, 'X'.repeat(2001)]) assert.throws(() => identity.customerIdentityInput({ nameOfficial: value }))
assert.throws(() => identity.customerIdentityInput({ displayName: 'forged' }))
assert.throws(() => identity.customerIdentityInput({ identityKind: 'PERSON' }))
assert.throws(() => identity.customerIdentityInput({ givenNames: 'Juan' }))
assert.throws(() => identity.customerIdentityInput({ identityKind: 'PERSON', givenNames: 'Juan', surnames: 'Pérez, López' }))
const person = identity.customerIdentityInput({ identityKind: 'PERSON', givenNames: 'Juan Carlos', surnames: 'Pérez López' })
assert.equal(identity.serializeCustomer({ name: raw, ...person }).displayName, 'Juan Carlos Pérez López')
assert.equal(identity.serializeCustomer({ name: raw, identityKind: 'COMPANY' }).displayName, raw)
assert.equal(identity.customerIdentityInput({ identityKind: null }).givenNames, null)
console.log('Customer identity pure checks OK')

let session = { user: { id: 'user-a', tenantId: 'tenant-a', role: 'ADMIN' } }
let stored = { id: 'customer-a', tenantId: 'tenant-a', name: 'Legacy', nameOfficial: raw, firstName: 'Legacy', secondName: null }
let duplicate = null, writes = []
const customer = {
  findFirst: async ({ where }) => {
    assert.equal(where.tenantId, 'tenant-a')
    if (where.id) return where.id === stored.id ? stored : null
    if (where.OR) assert.ok(where.OR.some(part => part.phone === '123'))
    return duplicate
  },
  create: async ({ data }) => { assert.equal(data.tenantId, 'tenant-a'); writes.push(data); return { id: 'new', ...data } },
  update: async ({ where, data }) => { assert.equal(where.tenantId, 'tenant-a'); writes.push(data); stored = { ...stored, ...data }; return stored },
}
const http = { tenantId: async () => session?.user.tenantId, json: (body, init = {}) => ({ body, status: init.status || 200 }), error: (message, status = 400) => ({ message, status }) }
const auth = { requireSession: async () => session }
const helpers = { addressesInput: () => undefined, leerPorcentajeSeguro: () => undefined }
const prisma = { customer, auditLog: { create: async () => {} } }
const collection = load('../app/api/customers/route.ts', {
  '@prisma/client': { Prisma: {} }, '../../../lib/prisma': { prisma }, '../../../lib/auth': auth,
  '../../../lib/http': http, '../../../lib/montos': { LIMITE_MONTO_GENERAL: 1_000_000 }, './_lib': helpers, '../../../lib/customer-identity': identity,
})
const request = body => ({ json: async () => body })
const createBody = { name: 'Legacy', phone: '123', nameOfficial: raw, tenantId: 'forged' }
let response = await collection.POST(request(createBody))
assert.equal(response.status, 201)
assert.equal(response.body.nameOfficial, raw)
assert.equal(response.body.displayName, 'Legacy')
assert.equal(writes.at(-1).billingName, undefined)
duplicate = stored
const before = writes.length
response = await collection.POST(request(createBody))
assert.equal(response.status, 409)
assert.equal(writes.length, before)
for (const identityBody of [{ identityKind: null }, { nameOfficial: null }, { ...person }]) {
  response = await collection.POST(request({ name: 'Legacy', phone: '123', ...identityBody }))
  assert.equal(response.status, 409)
  assert.equal(writes.length, before)
}
response = await collection.POST(request({ name: 'Old caller', phone: '123' }))
assert.equal(response.status, 200)
assert.equal(writes.at(-1).nameOfficial, undefined)
assert.equal(response.body.nameOfficial, raw)
class InputError extends Error {}
const detail = load('../app/api/customers/[id]/route.ts', {
  '../../../../lib/prisma': { prisma }, '../../../../lib/auth': auth, '../../../../lib/http': http,
  '../../../../lib/payment-input': { InputError, objectInput: body => body, textInput: value => value.trim() },
  '../../../../lib/montos': { LIMITE_MONTO_GENERAL: 1_000_000 }, '../_lib': helpers,
  '../../../../lib/customer-identity': identity,
  '../../../../lib/inspection': {}, '../../../../lib/insurance': {},
})
const params = { params: { id: stored.id } }
response = await detail.PATCH(request({ name: 'Manual edit' }), params)
assert.equal(response.status, 200)
assert.equal(response.body.nameOfficial, raw)
assert.equal(writes.at(-1).nameOfficial, undefined)
response = await detail.PATCH(request({ ...person }), params)
assert.equal(response.body.name, 'Manual edit')
assert.equal(response.body.displayName, 'Juan Carlos Pérez López')
response = await detail.PATCH(request({ nameOfficial: null }), params)
assert.equal(response.body.nameOfficial, null)
assert.equal(response.body.identityKind, 'PERSON')
response = await detail.PATCH(request({ identityKind: 'COMPANY' }), params)
assert.equal(response.body.givenNames, null)
assert.equal(response.body.surnames, null)
assert.equal(response.body.displayName, 'Manual edit')
let count = writes.length
response = await detail.PATCH(request({ nameOfficial: ' ' }), params)
assert.equal(response.status, 400)
assert.equal(writes.length, count)
response = await detail.PATCH(request({ nameOfficial: raw }), { params: { id: 'another-tenant-customer' } })
assert.equal(response.status, 404)
assert.equal(writes.length, count)
session = null
response = await collection.POST(request(createBody))
assert.equal(response.status, 401)
response = await detail.PATCH(request({ nameOfficial: raw }), params)
assert.equal(response.status, 401)
assert.equal(writes.length, count)
console.log('Customer identity API mocked checks OK (tenant, omission, duplicate no-write, explicit classification)')

session = { user: { id: 'user-a', tenantId: 'tenant-a', role: 'ADMIN' } }
let billing = { id: 'billing-a', tenantId: 'tenant-a', customerId: stored.id, name: raw, document: '80012345-0' }
const billingDb = {
  findMany: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return [billing] },
  findFirst: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); assert.equal(where.customerId, stored.id); return where.id === billing.id ? billing : null },
  create: async ({ data }) => { assert.equal(data.tenantId, 'tenant-a'); writes.push(data); billing = { id: 'billing-a', ...data }; return billing },
  update: async ({ data }) => { writes.push(data); billing = { ...billing, ...data }; return billing },
}
prisma.customerBillingIdentity = billingDb
prisma.$transaction = async callback => callback(prisma)
const billingRoute = load('../app/api/customers/[id]/billing-identities/route.ts', {
  '../../../../../lib/customer-identity': identity, '../../../../../lib/prisma': { prisma },
  '../../../../../lib/auth': auth, '../../../../../lib/http': http,
})
response = await billingRoute.POST(request({ name: raw, document: '80012345-0' }), params)
assert.equal(response.status, 201)
assert.equal(response.body.name, raw)
response = await billingRoute.PATCH(request({ id: billing.id, name: '  Another Holder, S.A.  ', useAsCurrent: true }), params)
assert.equal(response.body.name, '  Another Holder, S.A.  ')
assert.equal(stored.billingName, '  Another Holder, S.A.  ')
assert.notEqual(stored.billingName, stored.nameOfficial)
response = await billingRoute.PATCH(request({ id: billing.id, document: '1234567' }), params)
assert.equal(response.body.name, '  Another Holder, S.A.  ')
count = writes.length
for (const name of [' ', 'X'.repeat(2001)]) {
  response = await billingRoute.POST(request({ name, document: '80012345-0' }), params)
  assert.equal(response.status, 400)
  assert.equal(writes.length, count)
}
response = await billingRoute.POST(request({ name: raw, document: '80012345-0' }), { params: { id: 'foreign' } })
assert.equal(response.status, 404)
assert.equal(writes.length, count)
console.log('Billing identity mocked checks OK (exact holder, omission, independent identity, tenant guard)')

// Real GET handlers expose raw identity and computed display without DB/network.
stored = { ...stored, nameOfficial: raw, ...person }
const emptyRows = async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return [] }
for (const key of ['order', 'warrantyCase', 'customerNote', 'customerBillingIdentity', 'customerFollowUp', 'deviceReportShare', 'serviceOrder', 'customerNotice']) {
  prisma[key] = { findMany: emptyRows, groupBy: emptyRows }
}
response = await detail.GET({}, params)
assert.equal(response.body.customer.nameOfficial, raw)
assert.equal(response.body.customer.displayName, 'Juan Carlos Pérez López')
assert.ok(Array.isArray(response.body.billingIdentities))
prisma.$queryRaw = async () => [{ id: stored.id }]
customer.findMany = async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return [stored] }
const sql = (strings, ...values) => ({ strings, values })
const collectionGet = load('../app/api/customers/route.ts', {
  '@prisma/client': { Prisma: { sql, join: values => values } }, '../../../lib/prisma': { prisma }, '../../../lib/auth': auth,
  '../../../lib/http': http, '../../../lib/montos': { LIMITE_MONTO_GENERAL: 1_000_000 }, './_lib': helpers, '../../../lib/customer-identity': identity,
})
response = await collectionGet.GET({ url: 'https://example.test/api/customers' })
assert.equal(response.body[0].nameOfficial, raw)
assert.equal(response.body[0].displayName, 'Juan Carlos Pérez López')
console.log('Customer collection/detail GET shape mocked checks OK')

// Current billing is separate: auto-listing must not inherit customer fiscal identity.
prisma.customerBillingIdentity = billingDb
billingDb.findMany = async () => []
stored.billingName = null
stored.billingDocument = null
count = writes.length
response = await billingRoute.GET({}, params)
assert.equal(response.body.length, 0)
assert.equal(writes.length, count)
stored.billingName = raw
stored.billingDocument = '80012345-0'
response = await billingRoute.GET({}, params)
assert.equal(response.body[0].name, raw)
assert.equal(writes.at(-1).name, raw)
// Legacy given-name edits must never replace raw official identity.
response = await detail.PATCH(request({ firstName: 'Edited', secondName: 'Legacy' }), params)
assert.equal(response.body.nameOfficial, raw)
assert.equal(response.body.name, 'Edited Legacy')
assert.equal(response.body.displayName, 'Juan Carlos Pérez López')
console.log('Billing GET separation and legacy-name edit preservation checks OK')

// Scoped follow-up regressions: general POST must not trim/truncate holders.
duplicate = null
const longHolder = `  ${'Separate Holder, S.A. '.repeat(14)}  `
response = await collection.POST(request({ name: 'New buyer', phone: '123', billingName: longHolder, billingDocument: '80012345-0' }))
assert.equal(response.status, 201)
assert.equal(response.body.billingName, longHolder)
count = writes.length
for (const billingName of [' ', 'X'.repeat(2001)]) {
  response = await collection.POST(request({ name: 'New buyer', billingName }))
  assert.equal(response.status, 400)
  assert.equal(writes.length, count)
}
// Unsupported fiscal row data must fail before any row can be imported.
response = await collection.POST(request({ rows: [{ name: 'First legacy row', phone: '123' }, { name: 'Fiscal row', nameOfficial: raw }] }))
assert.equal(response.status, 400)
assert.equal(writes.length, count)
duplicate = stored
response = await collection.POST(request({ name: 'Duplicate buyer', phone: '123', billingName: raw }))
assert.equal(response.status, 409)
assert.equal(writes.length, count)
console.log('General customer fiscal-holder and unsupported bulk identity regressions OK')

for (const field of ['nameOfficial', 'identityKind', 'givenNames', 'surnames', 'displayName', 'billingName', 'billingDocument']) {
  count = writes.length
  response = await collection.POST(request({ rows: [{ name: 'Unsupported fiscal row', phone: '123', [field]: null }] }))
  assert.equal(response.status, 400, `${field} must not be silently dropped from bulk rows`)
  assert.equal(writes.length, count)
}
console.log('All unsupported bulk fiscal fields rejected before writes')
