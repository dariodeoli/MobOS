import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { InputError, objectInput, textInput } from '../lib/payment-input'

function loadRoute(modules: Record<string, unknown>) {
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(readFileSync(require.resolve('../app/api/inventory-counts/route.ts'), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, Date, Set, Map, require: (name: string) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name] } })
  return exports
}
const http = { json: (data: unknown, init?: ResponseInit) => Response.json(data, init), error: (message: string, status = 400) => Response.json({ message }, { status }), tenantId: async () => 'tenant' }
const request = (body: unknown) => new Request('http://test/api/inventory-counts', { method: 'PATCH', body: JSON.stringify(body) })
const postRequest = (body: unknown) => new Request('http://test/api/inventory-counts', { method: 'POST', body: JSON.stringify(body) })

function makeRoute() {
  const session = { user: { id: 'manager', tenantId: 'tenant', role: 'ADMIN', permissions: ['stock:manage'] } }
  const count: any = { id: 'count1', tenantId: 'tenant', branchId: 'branch1', locationId: null, scope: 'PARTIAL', status: 'DRAFT', createdById: 'seller', applyResult: null, stockSnapshot: { product1: 7 } }
  let productStock = 7
  const lines = [{ id: 'line1', productId: 'product1', serial: null, quantity: 4, expected: false }]
  const audits: any[] = []
  const db: any = {
    inventoryCount: { findFirst: async () => count, updateMany: async (q: any) => { if (count.status !== q.where.status) return { count: 0 }; Object.assign(count, q.data); return { count: 1 } } },
    inventoryCountLine: { findMany: async () => lines, count: async () => lines.length },
    inventoryUnit: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    product: { findMany: async () => [{ id: 'product1', stock: productStock }], updateMany: async (q: any) => { if (q.where.stock !== productStock) return { count: 0 }; productStock = q.data.stock; return { count: 1 } } },
    auditLog: { create: async (q: any) => { audits.push(q.data) } },
    $transaction: async (callback: any) => callback(db),
  }
  const route = loadRoute({ '../../../lib/prisma': { prisma: db }, '../../../lib/auth': { requireSession: async () => session, canAccessAny: () => true }, '../../../lib/http': http, '../../../lib/payment-input': { InputError, objectInput, textInput }, '../../../lib/stock': { recomputeStock: async () => {} }, '../../../lib/store-branch': { ensureStoreBranch: async () => 'branch1' } })
  return { route, count, db, audits, stock: () => productStock, setStock: (value: number) => { productStock = value } }
}

test('inventory count apply requires a reason, applies branch quantity difference once, and replays persisted result', async () => {
  const { route, count, audits, stock } = makeRoute()
  const denied = await route.PATCH(request({ id: 'count1', action: 'apply' }))
  assert.equal(denied.status, 400)
  assert.equal(stock(), 7)
  const first = await route.PATCH(request({ id: 'count1', action: 'apply', reason: 'Conteo físico de góndola' }))
  assert.equal(first.status, 200)
  const payload: any = await first.json()
  assert.equal(stock(), 4)
  assert.deepEqual(JSON.parse(JSON.stringify(payload.quantities)), [{ productId: 'product1', before: 7, counted: 4, delta: -3 }])
  assert.equal(payload.applied.appliedById, 'manager')
  assert.equal(count.status, 'APPLIED')
  assert.ok(audits.some(a => a.action === 'INVENTORY_COUNT_QUANTITY_ADJUSTED' && a.metadata.before === 7 && a.metadata.after === 4 && a.metadata.reason === 'Conteo físico de góndola'))
  const replay = await route.PATCH(request({ id: 'count1', action: 'apply', reason: 'reintento' }))
  assert.equal(replay.status, 200)
  assert.equal(stock(), 4)
  assert.equal(audits.filter(a => a.action === 'INVENTORY_COUNT_QUANTITY_ADJUSTED').length, 1)
})

test('quantity line on location-scoped count is rejected before changing global branch stock', async () => {
  const { route, count, stock } = makeRoute()
  count.locationId = 'location1'
  const response = await route.PATCH(request({ id: 'count1', action: 'scan', productId: 'product1', quantity: 2 }))
  assert.equal(response.status, 409)
  assert.equal(stock(), 7)
})

test('quantity apply refuses to overwrite sales or receptions made while the count was open', async () => {
  const { route, setStock, stock, audits } = makeRoute()
  setStock(6)
  const response = await route.PATCH(request({ id: 'count1', action: 'apply', reason: 'Conteo de turno' }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).message, /stock cambió durante el conteo/i)
  assert.equal(stock(), 6)
  assert.equal(audits.some(a => a.action === 'INVENTORY_COUNT_APPLIED'), false)
})

test('apply without adjustment records approval and reason without changing stock', async () => {
  const { route, stock, count, audits } = makeRoute()
  const response = await route.PATCH(request({ id: 'count1', action: 'apply', adjust: false, reason: 'Revisión documentada' }))
  assert.equal(response.status, 200)
  assert.equal(stock(), 7)
  assert.equal(count.status, 'APPLIED')
  assert.equal(count.applyResult.adjust, false)
  assert.ok(audits.some(a => a.action === 'INVENTORY_COUNT_APPLIED' && a.metadata.reason === 'Revisión documentada' && a.metadata.adjust === false))
  assert.equal(audits.some(a => a.action === 'INVENTORY_COUNT_QUANTITY_ADJUSTED'), false)
})

test('creating a location-scoped count validates tenant and branch ownership before saving', async () => {
  let saved = false
  const session = { user: { id: 'manager', tenantId: 'tenant', role: 'ADMIN', permissions: ['stock:manage'] } }
  const db: any = {
    branch: { findFirst: async () => ({ id: 'branch1' }) },
    stockLocation: { findFirst: async (query: any) => query.where.branchId === 'branch1' ? null : null },
    product: { findMany: async () => [] },
    inventoryCount: { create: async () => { saved = true; return { id: 'count1' } } },
    auditLog: { create: async () => {} },
    $transaction: async (callback: any) => callback(db),
  }
  const route = loadRoute({ '../../../lib/prisma': { prisma: db }, '../../../lib/auth': { requireSession: async () => session, canAccessAny: () => true }, '../../../lib/http': http, '../../../lib/payment-input': { InputError, objectInput, textInput }, '../../../lib/stock': { recomputeStock: async () => {} }, '../../../lib/store-branch': { ensureStoreBranch: async () => 'branch1' } })
  const response = await route.POST(postRequest({ branchId: 'branch1', locationId: 'other-branch-location', scope: 'PARTIAL' }))
  assert.equal(response.status, 404)
  assert.equal(saved, false)
})
