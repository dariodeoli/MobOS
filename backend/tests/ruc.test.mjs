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

// Almacén de intentos en memoria que imita la ventana persistente de
// AuthAttempt: la lógica de cuotas (alcance, ventana, límite y error) es la
// misma que consumeAuthAttemptWindow usa contra la base real.
function fakeRucDb(getNow) {
  const rows = []
  return {
    async $transaction(fn) {
      return fn({
        authAttempt: {
          deleteMany: async ({ where }) => {
            for (let i = rows.length - 1; i >= 0; i--) {
              const row = rows[i]
              if (row.scope === where.scope && row.fingerprint === where.fingerprint && row.createdAt.getTime() < where.createdAt.lt.getTime()) rows.splice(i, 1)
            }
          },
          count: async ({ where }) => rows.filter((row) => row.scope === where.scope && row.fingerprint === where.fingerprint && row.createdAt.getTime() >= where.createdAt.gte.getTime()).length,
          findFirst: async ({ where }) => {
            const matches = rows.filter((row) => row.scope === where.scope && row.fingerprint === where.fingerprint && row.createdAt.getTime() >= where.createdAt.gte.getTime())
            matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            return matches[0] ? { createdAt: matches[0].createdAt } : null
          },
          create: async ({ data }) => { rows.push({ scope: data.scope, fingerprint: data.fingerprint, createdAt: new Date(getNow().getTime()) }) },
        },
      })
    },
  }
}

try {
  assert.deepEqual(ruc.normalizeRuc('80.012.345-6'), { input: '80.012.345-6', lookup: '80012345-6', formatted: '80012345-6' }); checks++
  assert.equal(ruc.normalizeRuc('80012345').lookup, '80012345'); checks++
  for (const input of ['', '80012345-66', 'RUC-800', '80--1', '1234-5']) { assert.throws(() => ruc.normalizeRuc(input)); checks++ }

  const oldAccountLimit = process.env.RUC_ACCOUNT_HOURLY_LIMIT
  const oldInstallationLimit = process.env.RUC_INSTALLATION_MONTHLY_LIMIT
  process.env.RUC_ACCOUNT_HOURLY_LIMIT = '2'; process.env.RUC_INSTALLATION_MONTHLY_LIMIT = '3'
  let clock = 1_000
  const db = fakeRucDb(() => new Date(clock))
  const consume = (accountId, installationId) => { const now = new Date(clock); clock += 1_000; return ruc.consumeRucQuota(accountId, installationId, { db, now }) }
  ok((await consume('tenant-a:user-a', 'install-a')).accountRemaining === 1, 'first account quota')
  ok((await consume('tenant-a:user-a', 'install-a')).accountRemaining === 0, 'second account quota')
  await assert.rejects(() => consume('tenant-a:user-a', 'install-a'), error => error.code === 'account_rate_limited'); checks++
  ok((await consume('tenant-b:user-b', 'install-a')).installationRemaining === 0, 'installation quota')
  await assert.rejects(() => consume('tenant-c:user-c', 'install-a'), error => error.code === 'installation_rate_limited'); checks++
  ok((await consume('tenant-c:user-c', 'install-b')).installationRemaining === 2, 'different installation has its own quota')
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
  console.log(`RUC: ${checks} checks OK (normalization, quotas persistentes, provider mapping and fallback).`)
} finally {
  // Sin estado global: las cuotas viven en AuthAttempt de la base.
}
