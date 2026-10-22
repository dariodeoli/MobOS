import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { verificationPolicy, policyFromSettings, canVerify, assertCanVerify, verificationSnapshot } from '../lib/stock-verification-policy'
import { InputError, objectInput, textInput } from '../lib/payment-input'

const load = (path: string, modules: Record<string, unknown>) => {
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(readFileSync(require.resolve(path), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, Date, Set, console, require: (name: string) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name] } })
  return exports
}
const http = { json: (data: unknown, init?: ResponseInit) => Response.json(data, init), error: (message: string, status = 400) => Response.json({ message }, { status }) }

test('política: ausencia conserva roles; lista vacía deniega; datos extra nunca habilitan quitar actor/fecha', () => {
  assert.ok(canVerify(policyFromSettings({}), 'CAJERA'))
  assert.equal(canVerify(verificationPolicy({ roles: [] }), 'ADMIN'), false)
  assert.throws(() => assertCanVerify(verificationPolicy({ roles: ['GERENTE'] }), 'VENDEDOR'), (e: unknown) => e instanceof InputError && e.status === 403)
  const policy = verificationPolicy({ roles: ['GERENTE', 'GERENTE', '*'], records: ['battery', 'notes', 'actor', 'verifiedAt', 'costPyg'] })
  assert.deepEqual(policy, { roles: ['GERENTE'], records: ['battery', 'notes'] })
  assert.deepEqual(verificationSnapshot(policy, { condition: 'USED', batteryHealth: 100, batteryCycles: 0, notes: 'Precinto' }), { batteryHealth: 100, batteryCycles: 0, notes: 'Precinto' })
})

test('owner real: exige cuenta, tenant y perfil activo OWNER, no solo rol ADMIN', async () => {
  let context: any = null
  let membership: any = { id: 'm' }
  const queries: any[] = []
  const module = load('../lib/stock-verification-policy.ts', {
    './auth': { USER_ROLES: ['ADMIN'], requireAccountContext: async () => context },
    './prisma': { prisma: { tenantMembership: { findFirst: async (q: any) => { queries.push(q); return membership } } } },
    './payment-input': { InputError },
  })
  const session = { user: { id: 'u1', tenantId: 't1', role: 'ADMIN' } }
  assert.equal(await module.verificationOwner(new Request('http://test'), session), false)
  context = { accountId: 'a', tenantId: 't1', sellerUserId: 'u2' }
  assert.equal(await module.verificationOwner(new Request('http://test'), session), false)
  context.sellerUserId = 'u1'; membership = null
  assert.equal(await module.verificationOwner(new Request('http://test'), session), false)
  membership = { id: 'm' }
  assert.equal(await module.verificationOwner(new Request('http://test'), session), true)
  assert.deepEqual(JSON.parse(JSON.stringify(queries[0].where)), { accountId: 'a', tenantId: 't1', userId: 'u1', role: 'OWNER', revokedAt: null })
})

test('ruta de política: gerente/admin sin propiedad no guardan; dueño audita y preserva settings vecinos', async () => {
  let owner = false
  let settings: any = { other: { intact: true }, stockDisplay: { planilla: {} } }
  const audits: any[] = []
  const db: any = {
    tenant: { findUnique: async () => ({ settings }), findUniqueOrThrow: async () => ({ settings }), update: async (q: any) => { settings = q.data.settings } },
    auditLog: { create: async (q: any) => { audits.push(q.data) } }, $queryRaw: async () => [{ id: 'tenant' }],
  }
  db.$transaction = async (fn: any) => fn(db)
  const session = { user: { id: 'owner', tenantId: 'tenant', role: 'ADMIN' } }
  const route = load('../app/api/tenant/stock-verification/route.ts', {
    '@prisma/client': {}, '../../../../lib/prisma': { prisma: db }, '../../../../lib/auth': { requireSession: async () => session }, '../../../../lib/http': http, '../../../../lib/modulos-guard': { moduloGuard: async () => null },
    '../../../../lib/stock-verification-policy': { verificationPolicy, policyFromSettings, canVerify, verificationOwner: async () => owner },
  })
  const req = (body: unknown) => new Request('http://test', { method: 'PUT', body: JSON.stringify(body) })
  const policy = { roles: ['GERENTE'], records: ['battery'] }
  assert.equal((await route.PUT(req(policy))).status, 403)
  assert.equal(audits.length, 0)
  owner = true
  assert.equal((await route.PUT(req({ roles: ['*'], records: [] }))).status, 400)
  assert.equal((await route.PUT(req(policy))).status, 200)
  assert.deepEqual(settings.other, { intact: true })
  assert.deepEqual(settings.stockVerification, policy)
  assert.equal(audits[0].userId, 'owner'); assert.equal(audits[0].tenantId, 'tenant')
  assert.ok(audits[0].metadata.configuredAt)
  assert.equal(audits[0].action, 'STOCK_VERIFICATION_POLICY_UPDATED')
})

test('check directo: política servidor bloquea batch disponible, permite recepción y audita foto sin costos', async () => {
  let units: any[] = []
  let updates = 0
  let policy = verificationPolicy({ roles: ['GERENTE'], records: ['battery', 'condition'] })
  const audits: any[] = []
  const db: any = {
    inventoryUnit: { findMany: async () => units, update: async () => { updates++ } },
    transitAssignment: { findFirst: async () => null }, stockTransfer: { findMany: async () => [] },
    auditLog: { create: async () => {}, createMany: async (q: any) => { audits.push(...q.data) } },
  }
  db.$transaction = async (fn: any) => fn(db)
  const session = { user: { id: 'seller', tenantId: 'tenant', role: 'VENDEDOR', branchId: 'branch' } }
  const route = load('../app/api/inventory-units/verify/route.ts', {
    '../../../../lib/prisma': { prisma: db }, '../../../../lib/auth': { requireSession: async () => session }, '../../../../lib/http': { ...http, tenantId: async () => 'tenant' }, '../../../../lib/modulos-guard': { moduloGuard: async () => null },
    '../../../../lib/validation': { serialKey: (v: any) => typeof v === 'string' ? v.toUpperCase() : '' },
    '../../../../lib/stock': { changeStock: async () => {} }, '../../../../lib/inventory': { INVENTORY_PHYSICALLY_VERIFIED: 'INVENTORY_PHYSICALLY_VERIFIED' },
    '../../../../lib/stock-verification': { canUndoVerification: () => true }, '../../../../lib/transit': { reservaDeAsignacion: () => ({ status: 'AVAILABLE' }), vincularAsignacionAlRecibir: async () => false },
    '../../../../lib/stock-verification-policy': { assertCanVerify, readVerificationPolicy: async () => policy, verificationSnapshot }, '../../../../lib/payment-input': { InputError },
  })
  const unit = { id: 'u', serial: 'S1', branchId: 'branch', status: 'AVAILABLE', productId: 'p', locationId: null, lastVerifiedAt: null, lastVerifiedById: null, verificationCount: 0, condition: 'NEW', batteryHealth: 100, batteryCycles: 0, notes: 'Nota', costPyg: 1000 }
  const request = () => new Request('http://test', { method: 'POST', body: JSON.stringify({ serial: 'S1' }) })
  units = [unit]
  assert.equal((await route.POST(request())).status, 403); assert.equal(updates, 0); assert.equal(audits.length, 0)
  units = [{ ...unit, status: 'IN_TRANSIT' }]
  assert.equal((await route.POST(request())).status, 200)
  assert.equal(audits[0].userId, 'seller'); assert.ok(audits[0].metadata.verifiedAt)
  assert.equal(audits[0].metadata.receivedInTransit, true)
  assert.deepEqual(audits[0].metadata.snapshot, { condition: 'NEW', batteryHealth: 100, batteryCycles: 0 })
  policy = verificationPolicy({ roles: ['VENDEDOR'], records: [] }); units = [unit]
  assert.equal((await route.POST(request())).status, 200)
  assert.ok(audits[1].metadata.previous); assert.ok(audits[1].metadata.verifiedAt)
  assert.deepEqual(audits[1].metadata.snapshot, {})
})

test('escaneo de sesión no permite evadir la política con una sesión ya abierta', async () => {
  let scans = 0
  const db: any = { stockVerification: { findFirst: async () => ({ id: 'v', tenantId: 't', branchId: 'b', status: 'OPEN' }) }, stockVerificationScan: { findUnique: async () => { scans++; return null } }, $queryRaw: async () => [{ status: 'OPEN' }] }
  db.$transaction = async (fn: any) => fn(db)
  const route = load('../app/api/stock-verifications/[id]/route.ts', {
    '../../../../lib/prisma': { prisma: db }, '../../../../lib/auth': { requireSession: async () => ({ user: { id: 'u', tenantId: 't', role: 'VENDEDOR', branchId: 'b' } }), canAccessAny: () => false },
    '../../../../lib/http': { ...http, tenantId: async () => 't' }, '../../../../lib/modulos-guard': { moduloGuard: async () => null }, '../../../../lib/payment-input': { InputError, objectInput, textInput },
    '../../../../lib/validation': { serialKey: (v: any) => v }, '../../../../lib/inventory': { INVENTORY_PHYSICALLY_VERIFIED: 'INVENTORY_PHYSICALLY_VERIFIED' },
    '../../../../lib/stock-verification': {}, '../../../../lib/stock-verification-db': {},
    '../../../../lib/stock-verification-policy': { assertCanVerify, readVerificationPolicy: async () => verificationPolicy({ roles: ['GERENTE'] }), verificationSnapshot },
  })
  const response = await route.PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ action: 'scan', serial: 'S1' }) }), { params: Promise.resolve({ id: 'v' }) })
  assert.equal(response.status, 403); assert.equal(scans, 0)
})
