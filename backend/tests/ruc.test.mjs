#!/usr/bin/env node
// Unit coverage for server-only RUC normalization, quotas and provider mapping.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)

const ruc = require('../lib/ruc.ts')
let checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks++ }

try {
  assert.deepEqual(ruc.normalizeRuc('80.012.345-6'), { input: '80.012.345-6', lookup: '80012345-6', formatted: '80012345-6' }); checks++
  assert.equal(ruc.normalizeRuc('80012345').lookup, '80012345'); checks++
  for (const input of ['', '80012345-66', 'RUC-800', '80--1', '1234-5']) { assert.throws(() => ruc.normalizeRuc(input)); checks++ }

  const oldAccountLimit = process.env.RUC_ACCOUNT_HOURLY_LIMIT
  const oldInstallationLimit = process.env.RUC_INSTALLATION_MONTHLY_LIMIT
  process.env.RUC_ACCOUNT_HOURLY_LIMIT = '2'; process.env.RUC_INSTALLATION_MONTHLY_LIMIT = '3'
  ruc.resetRucRateLimitsForTests()
  ok(ruc.consumeRucQuota('tenant-a:user-a', 'install-a', 1_000).accountRemaining === 1, 'first account quota')
  ok(ruc.consumeRucQuota('tenant-a:user-a', 'install-a', 2_000).accountRemaining === 0, 'second account quota')
  assert.throws(() => ruc.consumeRucQuota('tenant-a:user-a', 'install-a', 3_000), error => error.code === 'account_rate_limited'); checks++
  ok(ruc.consumeRucQuota('tenant-b:user-b', 'install-a', 4_000).installationRemaining === 0, 'installation quota')
  assert.throws(() => ruc.consumeRucQuota('tenant-c:user-c', 'install-a', 5_000), error => error.code === 'installation_rate_limited'); checks++
  ok(ruc.consumeRucQuota('tenant-c:user-c', 'install-b', 5_000).installationRemaining === 2, 'different installation has its own quota')
  if (oldAccountLimit === undefined) delete process.env.RUC_ACCOUNT_HOURLY_LIMIT; else process.env.RUC_ACCOUNT_HOURLY_LIMIT = oldAccountLimit
  if (oldInstallationLimit === undefined) delete process.env.RUC_INSTALLATION_MONTHLY_LIMIT; else process.env.RUC_INSTALLATION_MONTHLY_LIMIT = oldInstallationLimit

  let requested = ''
  const result = await ruc.lookupRuc('80.012.345-6', { fetchImpl: async (url, init) => {
    requested = String(url)
    ok(init.headers.Accept === 'application/json', 'provider accepts JSON')
    return Response.json({ name: 'Empresa de Prueba S.A.', ruc: '80012345', dv: '6', fullRuc: '80012345-6', state: 'ACTIVO', publicationDateText: 'Hoy' })
  }, now: new Date('2026-09-12T12:00:00.000Z') })
  ok(requested === 'https://ruc.sun.com.py/api/ruc/80012345-6', 'only normalized RUC leaves the server')
  assert.equal(result.result.name, 'Empresa de Prueba S.A.'); checks++
  assert.equal(result.reviewRequired, true); checks++
  await assert.rejects(() => ruc.lookupRuc('80012345-6', { fetchImpl: async () => new Response('', { status: 404 }) }), error => error.code === 'not_found'); checks++
  await assert.rejects(() => ruc.lookupRuc('80012345-6', { fetchImpl: async () => { throw new Error('offline') } }), error => error.code === 'provider_unavailable'); checks++
  console.log(`RUC: ${checks} checks OK (normalization, quotas, provider mapping and fallback).`)
} finally {
  ruc.resetRucRateLimitsForTests()
}
