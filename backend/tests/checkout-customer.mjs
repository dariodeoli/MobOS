// Run: MOBOS_CHECKOUT_TEST=1 node backend/tests/checkout-customer.mjs
// Real route, auth, payments and PostgreSQL transactions; synthetic data only.
// Creates its own disposable cluster; never loads .env, builds, or uses an existing DB.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'

// HTTP hook: base admin seller company otherSeller (all from the temporary harness).
async function testHttp([base, admin, seller, company, otherSeller]) {
  const url = new URL(base)
  assert.ok(process.env.MOBOS_IT_EXECUTE === '1' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname), 'HTTP tests require the local opt-in harness')
  assert.ok(admin && seller && company && otherSeller, 'base admin seller company otherSeller required')
  let checks = 0
  let sequence = 0
  const prefix = `CHECKOUT-${Date.now()}`
  async function req(path, token, method = 'GET', body, status = 200) {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': 'tenant-b-it' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`)
    checks++; return result
  }
  const product = await req('/api/products', admin, 'POST', { name: prefix, sku: prefix, stock: 30, pricePyg: 100 }, 201)
  const order = (extra, status = 201, token = seller) => req('/api/orders', token, 'POST', { orderNumber: `${prefix}-${++sequence}`, items: [{ productId: product.id, quantity: 1, unitPricePyg: 100 }], ...extra }, status)
  const customers = () => req(`/api/customers?q=${encodeURIComponent(prefix)}`, seller)
  const snapshot = async () => ({ customers: await customers(), orders: await req('/api/orders', seller), products: await req('/api/products', seller) })
  const reject = async (body, status = 409, token = seller) => {
    const before = await snapshot()
    const result = await order(body, status, token)
    assert.deepEqual(await snapshot(), before, 'HTTP failure must roll back customer, order and stock')
    return result
  }
  await reject({ customer: { name: prefix } }, 401, company)
  await reject({ customer: { name: prefix } }, 401, 'invalid')
  const customer = { name: `${prefix} Ana`, phone: '0981000000', address: 'Calle de prueba 123' }
  const first = await order({ customer })
  assert.equal(first.customer.name, customer.name)
  assert.equal(first.seller.id, first.sellerId)
  assert.deepEqual(Object.keys(first.seller).sort(), ['id', 'name'])
  let saved = (await customers()).find(c => c.id === first.customerId)
  assert.equal(saved.phone, customer.phone); assert.equal(saved.addresses?.[0]?.address, customer.address)
  assert.equal((await order({ customer: { ...customer, name: customer.name.toLowerCase() } })).customerId, saved.id)
  assert.equal((await order({ customerId: saved.id })).customerId, saved.id)
  await reject({ customer: { ...customer, phone: 'different' } })
  // Un mismo cliente puede sumar direcciones sin crear un duplicado.
  assert.equal((await order({ customer: { ...customer, address: 'Different address' } })).customerId, saved.id)
  saved = (await customers()).find(c => c.id === first.customerId)
  assert.equal(saved.addresses?.length, 2)
  for (const phone of ['111', '222']) await req('/api/customers', admin, 'POST', { name: `${prefix} Duplicate`, phone }, 201)
  assert.match((await reject({ customer: { name: `${prefix} Duplicate`, phone: '111' } })).message, /customerId/)
  const foreign = await req('/api/customers', otherSeller, 'POST', { name: `${prefix} Foreign`, phone: '999' }, 201)
  await reject({ customerId: foreign.id })
  assert.notEqual((await order({ customer: { name: foreign.name, phone: foreign.phone } })).customerId, foreign.id)
  await req('/api/customers', otherSeller, 'POST', { name: customer.name }, 201)
  assert.equal((await order({ customer: { name: customer.name } })).customerId, saved.id)
  for (const body of [{ customerId: saved.id, customer }, { customerId: { not: null } }, { customer: null }, { customer: { name: '' } }, { customer: { name: prefix, phone: 123 } }, { customer: { ...customer, tenantId: 'tenant-b-it' } }, { customer: { ...customer, notes: 'Override' } }, { couponCode: 'SAVE10' }]) await reject(body, 400)
  await reject({ customer: { name: `${prefix} Rollback stock` }, items: [{ productId: product.id, quantity: 999, unitPricePyg: 100 }] })
  await reject({ customer: { name: `${prefix} Rollback payment` }, payments: [{ method: 'CASH', amountPyg: 101 }] })
  await reject({ customer: { name: `${prefix} Rollback DB` }, orderNumber: first.orderNumber })
  await reject({ customer: { name: `${prefix} Rollback branch` }, items: [{ productId: 'prod-a-crossbranch-it', quantity: 1, unitPricePyg: 100 }] })
  await reject({ customer: { name: `${prefix} Rollback tenant` }, items: [{ productId: 'prod-b-it', quantity: 1, unitPricePyg: 100 }] })
  const parallel = await Promise.all([0, 1, 2].map(i => order({ customer: { name: i % 2 ? `${prefix} Concurrent`.toLowerCase() : `${prefix} Concurrent` }, items: [{ description: 'Service', quantity: 1, unitPricePyg: 100 }] })))
  assert.equal(new Set(parallel.map(o => o.customerId)).size, 1)
  assert.deepEqual((await customers()).find(c => c.id === saved.id), saved)
  assert.ok((await customers()).every(c => c.tenantId === saved.tenantId))
  console.log(`Checkout customer HTTP: ${checks} checks OK (atomicity, concurrency, customer selection and isolation).`)
}

if (process.argv.length > 2) {
  await testHttp(process.argv.slice(2))
  process.exit(0)
}

if (process.env.MOBOS_CHECKOUT_TEST !== '1') {
  console.log('Opt-in: MOBOS_CHECKOUT_TEST=1 node backend/tests/checkout-customer.mjs')
  process.exit(0)
}
const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
for (const binary of ['initdb', 'pg_ctl', 'createdb', 'psql']) execFileSync(join(pgBin, binary), ['--version'])
const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.on('error', reject)
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) })
})
const root = mkdtempSync(join(tmpdir(), 'mobos-checkout-'))
const pgdata = join(root, 'pgdata')
const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/mobos_checkout_test`
const env = { ...process.env, DATABASE_URL: databaseUrl, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: 'mobos_checkout_test' }
const run = (binary, args, input) => execFileSync(join(pgBin, binary), args, { env, input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false
let prisma
let checks = 0
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start'])
  started = true
  run('createdb', ['mobos_checkout_test'])
  const migrations = join(backend, 'prisma/migrations')
  for (const entry of readdirSync(migrations, { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    run('psql', ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', databaseUrl], readFileSync(join(migrations, entry.name, 'migration.sql')))
  }
  process.env.DATABASE_URL = databaseUrl
  process.env.NODE_ENV = 'test'
  assert.equal(globalThis.prisma, undefined, 'Do not reuse a preexisting client')
  require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken } = require('../lib/auth.ts')
  const { POST } = require('../app/api/orders/route.ts')
  const { GET: customersGET } = require('../app/api/customers/route.ts')
  const pinHash = await require('bcryptjs').hash('2468', 10)
  for (const id of ['a', 'b']) {
    await prisma.tenant.create({ data: { id, name: `Synthetic ${id}`, slug: `checkout-${id}` } })
    await prisma.branch.create({ data: { id: `branch-${id}`, tenantId: id, name: `Branch ${id}` } })
    await prisma.user.create({ data: { id: `seller-${id}`, tenantId: id, branchId: `branch-${id}`, name: `Seller ${id}`, pinHash, role: 'VENDEDOR', status: 'ACTIVE' } })
    await prisma.session.create({ data: { tenantId: id, userId: `seller-${id}`, level: 'SELLER', deviceId: 'synthetic', tokenHash: hashToken(`token-${id}`), expiresAt: new Date(Date.now() + 3600000) } })
  }
  await prisma.session.create({ data: { tenantId: 'a', level: 'COMPANY', deviceId: 'synthetic', tokenHash: hashToken('company'), expiresAt: new Date(Date.now() + 3600000) } })
  await prisma.branch.create({ data: { id: 'branch-a2', tenantId: 'a', name: 'Other branch' } })
  for (const [id, tenantId, branchId] of [['product', 'a', 'branch-a'], ['other-branch', 'a', 'branch-a2'], ['foreign-product', 'b', 'branch-b']]) {
    await prisma.product.create({ data: { id, tenantId, branchId, sku: id, name: id, pricePyg: 100, stock: 20 } })
  }
  const newCustomer = (data) => prisma.customer.create({ data: { tenantId: 'a', ...data } })
  const snapshot = async () => ({
    customers: await prisma.customer.findMany({ orderBy: { id: 'asc' } }),
    orders: await prisma.order.findMany({ orderBy: { id: 'asc' } }),
    products: await prisma.product.findMany({ orderBy: { id: 'asc' } }),
    payments: await prisma.payment.findMany({ orderBy: { id: 'asc' } }),
  })
  let sequence = 0
  async function request(extra, expected = 201, token = 'token-a', raw) {
    const body = { orderNumber: `CHECKOUT-${++sequence}`, items: [{ productId: 'product', quantity: 1, unitPricePyg: 100 }], ...extra }
    const response = await POST(new Request('http://localhost/api/orders', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': 'b' }, body: raw === undefined ? JSON.stringify(body) : raw }))
    const result = await response.json()
    assert.equal(response.status, expected, JSON.stringify(result)); checks++
    return result
  }
  async function rejects(extra, expected = 409, token, raw) {
    const before = await snapshot()
    const result = await request(extra, expected, token, raw)
    assert.deepEqual(await snapshot(), before, 'Failure must leave customers, orders, stock and payments intact')
    return result
  }
  await rejects({ customer: { name: 'Unauthorized' } }, 401, 'missing')
  await rejects({ customer: { name: 'Company only' } }, 401, 'company')
  const created = await request({ customer: { name: '  Ana Pérez  ', phone: ' 0981000000 ', address: ' Calle Uno 123 ' } })
  assert.equal(created.customer.name, 'Ana Pérez')
  assert.deepEqual(created.seller, { id: 'seller-a', name: 'Seller a' })
  const ana = await prisma.customer.findUniqueOrThrow({ where: { id: created.customerId } })
  assert.equal(ana.tenantId, 'a'); assert.equal(ana.name, 'Ana Pérez'); assert.equal(ana.phone, '0981000000'); assert.equal(ana.notes, 'Dirección: Calle Uno 123')
  assert.equal(created.sellerId, 'seller-a'); assert.equal(created.branchId, 'branch-a')
  assert.equal((await request({ customer: { name: 'aNA péREZ', phone: ana.phone, address: 'Calle Uno 123' } })).customerId, ana.id)
  assert.equal((await request({ customer: { name: 'Ana Pérez' } })).customerId, ana.id)
  assert.deepEqual(await prisma.customer.findUnique({ where: { id: ana.id } }), ana, 'Reuse must not mutate customer')
  await rejects({ customer: { name: ana.name, phone: 'different' } })
  await rejects({ customer: { name: ana.name, address: 'Different address' } })
  const noPhone = await newCustomer({ name: 'No phone', notes: 'Preserve this note' })
  await rejects({ customer: { name: noPhone.name, phone: '123' } })
  await rejects({ customer: { name: noPhone.name, address: 'New address' } })
  await newCustomer({ name: 'Duplicate', phone: '111' })
  await newCustomer({ name: 'DUPLICATE', phone: '222' })
  const ambiguous = await rejects({ customer: { name: 'duplicate', phone: '111' } })
  assert.match(ambiguous.message, /Seleccioná.*customerId/)
  assert.equal((await request({ customerId: noPhone.id })).customerId, noPhone.id)
  const foreign = await newCustomer({ tenantId: 'b', name: 'Foreign only', phone: '999', notes: 'Private' })
  await rejects({ customerId: foreign.id })
  await rejects({ customerId: 'missing-customer' })
  const local = await request({ customer: { name: foreign.name, phone: foreign.phone } })
  assert.notEqual(local.customerId, foreign.id)
  await newCustomer({ tenantId: 'b', name: ana.name })
  assert.equal((await request({ customer: { name: ana.name } })).customerId, ana.id, 'Foreign name must not cause ambiguity')
  for (const body of [
    { customerId: ana.id, customer: { name: 'Both' } }, { customerId: null }, { customerId: '' }, { customerId: { not: null } },
    { customer: null }, { customer: [] }, { customer: 'name' }, { customer: {} }, { customer: { name: '  ' } },
    { customer: { name: 'A'.repeat(201) } }, { customer: { name: 'A', phone: 123 } }, { customer: { name: 'A', phone: '' } },
    { customer: { name: 'A', address: null } }, { customer: { name: 'A', address: 'A'.repeat(2001) } },
    { customer: { name: 'A', tenantId: 'b' } }, { customer: { name: 'A', notes: 'Override' } },
  ]) await rejects(body, 400)
  for (const raw of ['{', 'null', '[]', '1']) await rejects({}, 400, 'token-a', raw)
  for (const field of ['coupon', 'couponCode', 'couponCodes', 'discountCode', 'promoCode']) await rejects({ [field]: 'SAVE10' }, 400)
  await newCustomer({ name: 'Wildcard X' })
  for (const name of ['Wildcard %', 'Wildcard _', "Quote ' OR 1=1 --", 'Back\\slash']) {
    const order = await request({ customer: { name } })
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: order.customerId } })).name, name)
    assert.equal((await request({ customer: { name } })).customerId, order.customerId)
  }
  // Each failure happens after customer insertion, including a DB error and a late payment failure.
  await rejects({ customer: { name: 'Rollback stock' }, items: [{ productId: 'product', quantity: 1000, unitPricePyg: 100 }] })
  await rejects({ customer: { name: 'Rollback branch' }, items: [{ productId: 'other-branch', quantity: 1, unitPricePyg: 100 }] })
  await rejects({ customer: { name: 'Rollback tenant' }, items: [{ productId: 'foreign-product', quantity: 1, unitPricePyg: 100 }] })
  await rejects({ customer: { name: 'Rollback overpay' }, payments: [{ amountPyg: 101, method: 'CASH' }] })
  await rejects({ customer: { name: 'Rollback DB' }, orderNumber: created.orderNumber })
  await rejects({ customer: { name: 'Rollback payment' }, payments: [{ amountPyg: 100, method: 'INVALID' }] }, 400)
  // No stock contention: the name lock itself must prevent concurrent duplicate customers.
  const parallel = await Promise.all(Array.from({ length: 3 }, (_, i) => request({ customer: { name: i % 2 ? 'CONCURRENT' : 'Concurrent' }, items: [{ description: 'Service', quantity: 1, unitPricePyg: 100 }] })))
  assert.equal(new Set(parallel.map(o => o.customerId)).size, 1)
  assert.equal(await prisma.customer.count({ where: { tenantId: 'a', name: { equals: 'Concurrent', mode: 'insensitive' } } }), 1)
  const anonymous = await request({ items: [{ description: 'Service', quantity: 1, unitPricePyg: 100 }] })
  assert.equal(anonymous.customerId, null)
  const response = await customersGET(new Request('http://localhost/api/customers?q=Ana', { headers: { Authorization: 'Bearer token-a', 'x-tenant-id': 'b' } }))
  const listed = await response.json()
  assert.ok(listed.some(c => c.id === ana.id)); assert.ok(listed.every(c => c.tenantId === 'a'))
  assert.deepEqual(await prisma.customer.findUnique({ where: { id: foreign.id } }), foreign)
  console.log(`Checkout customer: ${checks} requests OK; real rollback, concurrent reuse, authentication and tenant/branch isolation verified.`)
} finally {
  if (prisma) await prisma.$disconnect()
  if (started) run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  // Exact path returned by mkdtemp, never a workspace or configured database path.
  rmSync(root, { recursive: true, force: true })
}
