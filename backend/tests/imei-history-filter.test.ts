import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { validarImei } from '../lib/imeicheck'

// Synthetic repeating digits only. Never invokes a provider or a real database.
const VALID = '111111111111119'
const INVALID = '111111111111111'
function fixture({ authenticated = true, permitted = true } = {}) {
  const calls: Array<{ where: Record<string, unknown>; take: number }> = []
  let balanceReads = 0
  const session = { user: { id: 'fixture-user', tenantId: 'fixture-tenant', role: 'ADMIN' } }
  const modules: Record<string, unknown> = {
    '../../../lib/prisma': { prisma: { imeiCheckQuery: { findMany: async (args: { where: Record<string, unknown>; take: number }) => { calls.push(args); return [] } } } },
    '../../../lib/http': { json: (data: unknown) => Response.json(data), error: (message: string, status = 400) => Response.json({ message }, { status }) },
    '../../../lib/auth': { requireSession: async () => authenticated ? session : null, canAccessAny: () => permitted },
    '../../../lib/imei-credits': { estadoCreditos: async () => { balanceReads++; return { saldo: 0, enforce: true } }, reservarConsulta: () => { throw new Error('Quota reservation forbidden in history tests') } },
    '../../../lib/imeicheck': { validarImei, SERVICIOS: {}, modoImeicheck: () => ({ modo: 'simulado' }), consultarImei: () => { throw new Error('Provider access forbidden in history tests') } },
    '../../../lib/modulos-guard': { moduloGuard: async () => null },
    '../../../lib/imei-providers': { publicImeiProviders: () => [] },
  }
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(readFileSync(require.resolve('../app/api/imei/route'), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, URL, Date, Set, console, require: (name: string) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name] } })
  return { get: (query = '') => exports.GET(new Request(`https://fixture.invalid/api/imei${query}`)) as Promise<Response>, calls, balances: () => balanceReads }
}
for (const value of ['', '   ', '123', INVALID]) test(`IMEI explicit invalid filter rejects before history and balance reads: ${JSON.stringify(value)}`, async () => {
  const f = fixture()
  const response = await f.get(`?imei=${encodeURIComponent(value)}`)
  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /IMEI|control/)
  assert.equal(f.calls.length, 0)
  assert.equal(f.balances(), 0)
})
test('IMEI absent filter preserves general authorized tenant history', async () => {
  const f = fixture()
  assert.equal((await f.get()).status, 200)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].where.tenantId, 'fixture-tenant')
  assert.equal(Object.hasOwn(f.calls[0].where, 'imei'), false)
})
test('IMEI valid normalized filter preserves tenant and pagination bounds', async () => {
  const f = fixture()
  assert.equal((await f.get('?imei=111%20111%20111%20111%20119&tenantId=other&limit=999')).status, 200)
  assert.equal(f.calls[0].where.imei, VALID)
  assert.equal(f.calls[0].where.tenantId, 'fixture-tenant')
  assert.equal(f.calls[0].take, 50)
})
test('IMEI history preserves session and permission gates before validation (módulo apagado: la lectura no se bloquea, ver modulos-guard.test.ts)', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ permitted: false }, 403]] as const) {
    const f = fixture(options)
    assert.equal((await f.get('?imei=123')).status, status)
    assert.equal(f.calls.length, 0)
  }
})
