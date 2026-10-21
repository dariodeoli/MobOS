#!/usr/bin/env node
// Unit coverage for server-only RUC normalization, quotas and provider mapping.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)

function load(path, modules) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(source, { exports, process, URL, URLSearchParams, Response, Headers, AbortSignal, TextDecoder, setTimeout, clearTimeout,
    require: name => Object.hasOwn(modules, name) ? modules[name] : require(name) })
  return exports
}
// Exercise the real quota algorithm without importing a database client.
const auth = load('../lib/auth.ts', { './prisma': { prisma: {} }, bcryptjs: {}, './pin': {}, './google-oauth': {}, './membership': {} })
const metadata = require('../lib/ruc-owndata.ts')
const ruc = load('../lib/ruc.ts', { './prisma': { prisma: {} }, './auth': auth,
  './ruc-owndata': metadata, './sifen/cdc': require('../lib/sifen/cdc.ts') })
const savedEnvironment = { ...process.env }
delete process.env.OWNDATA_API_KEY
delete process.env.OWNDATA_API_ORIGIN
process.env.NODE_ENV = 'test'
process.env.RUC_API_KEY = 'test-only-key-never-a-real-credential'
const official = '  APELLIDO, NOMBRE; S.A.  ' + 'X'.repeat(300) + '  '
const providerPayload = (overrides = {}) => ({
  data: { ruc: '80012345', dv: '0', fullRuc: '80012345-0', nameOfficial: official, equivalenceRaw: '  X  ', stateRaw: ' ACTIVO ', ...overrides },
  requestId: 'req_' + 'a'.repeat(24),
  meta: { environment: 'test', quota: { limit: 100, used: 1, remaining: 99, resetAfter: 300, day: '2026-10-11' },
    accounting: { charged: true, alreadyConsulted: false, cacheEnabled: false },
    provenance: { source: 'dnit_official_snapshot', sourcePage: 'https://www.dnit.gov.py/', publicationDate: '2026-10-11', publishedText: 'DNIT', importedAt: '2026-10-11T00:00:00Z', snapshotHash: 'a'.repeat(64) } },
})
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
        $executeRaw: async () => 1, $queryRaw: async () => [{ nowMs: BigInt(getNow().getTime()) }],
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
  assert.deepEqual(JSON.parse(JSON.stringify(ruc.normalizeRuc('80.012.345-0'))), { input: '80.012.345-0', lookup: '80012345-0', formatted: '80012345-0' }); checks++
  assert.equal(ruc.normalizeRuc('80012345').lookup, '80012345'); checks++
  for (const input of ['', '80012345-06', 'RUC-800', '80--1', '1234567890', '80012345-6']) { assert.throws(() => ruc.normalizeRuc(input)); checks++ }

  assert.equal(ruc.normalizeRuc('1').lookup, '1'); checks++
  assert.equal(ruc.normalizeRuc('123456789').lookup, '123456789'); checks++

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

  for (const value of ['NaN','Infinity','0','-1','', '1.5']) {
    process.env.RUC_ACCOUNT_HOURLY_LIMIT = value
    await assert.rejects(() => ruc.consumeRucQuota('u','i', {db: {$transaction: async () => {throw new Error('must not access DB')}}}), e => e.code === 'quota_not_configured'); checks++
  }
  if (oldAccountLimit === undefined) delete process.env.RUC_ACCOUNT_HOURLY_LIMIT; else process.env.RUC_ACCOUNT_HOURLY_LIMIT = oldAccountLimit

  const presentedPayload = () => ({ ...providerPayload(), namePresentation: {
    version: '2', methods: ['full'], subjectKind: 'individual', classificationSource: 'caller_confirmed',
    status: 'parsed', values: { full: 'NOMBRE APELLIDO' }, secret: process.env.RUC_API_KEY,
  } })
  let nameRequest
  const named = await ruc.lookupRuc('80012345', { subjectKind: 'individual', fetchImpl: async url => { nameRequest = new URL(url); return Response.json(presentedPayload()) } })
  assert.equal(nameRequest.search, '?nameMethods=full&subjectKind=individual'); checks++
  assert.equal(named.namePresentation.values.full, 'NOMBRE APELLIDO'); checks++
  assert.equal(named.result.nameOfficial, official); checks++
  ok(!JSON.stringify(named).includes(process.env.RUC_API_KEY), 'presentation never includes unknown secrets')
  const unconfirmed = await ruc.lookupRuc('80012345', { fetchImpl: async url => { assert.equal(new URL(url).search, ''); return Response.json(presentedPayload()) } })
  assert.equal(unconfirmed.namePresentation, undefined); checks++
  for (const mutate of [p => { delete p.namePresentation }, p => { p.data.namePresentation = p.namePresentation; delete p.namePresentation },
    p => { p.namePresentation.subjectKind = 'legal_entity' }, p => { p.namePresentation.classificationSource = 'unverified' },
    p => { p.namePresentation.values.full = 42 }, p => { p.namePresentation.values.full = '' }]) {
    const payload = presentedPayload(); mutate(payload)
    const fallback = await ruc.lookupRuc('80012345', {subjectKind:'individual',fetchImpl:async()=>Response.json(payload)})
    assert.equal(fallback.namePresentation, undefined); assert.equal(fallback.result.nameOfficial, official); checks++
  }
  const noView = presentedPayload(); noView.namePresentation.values.full = null
  assert.equal((await ruc.lookupRuc('80012345',{subjectKind:'individual',fetchImpl:async()=>Response.json(noView)})).namePresentation.values.full,null); checks++
  for (const query of ['subjectKind=company','subjectKind=individual&subjectKind=individual']) { assert.throws(()=>ruc.rucSubjectKind(new URLSearchParams(query)),e=>e.code==='INVALID_NAME_OPTIONS'); checks++ }
  assert.equal(ruc.rucSubjectKind(new URLSearchParams('subjectKind=individual')),'individual'); checks++
  process.env.OWNDATA_API_KEY='od_live_TEST_ONLY_NOT_A_REAL_KEY'
  process.env.OWNDATA_API_ORIGIN='https://app.controlaria.online'
  const livePayload=providerPayload(); livePayload.meta.environment='live'
  await ruc.lookupRuc('80012345',{fetchImpl:async(_url,init)=>{assert.equal(init.headers['X-API-Key'],process.env.OWNDATA_API_KEY);return Response.json(livePayload)}}); checks++
  await assert.rejects(()=>ruc.lookupRuc('80012345',{fetchImpl:async()=>Response.json(providerPayload())}),e=>e.code==='provider_invalid'); checks++
  for(const origin of ['http://app.controlaria.online','https://evil.invalid','https://user:password@app.controlaria.online','https://app.controlaria.online/path','https://app.controlaria.online/?x=1']) {
    process.env.OWNDATA_API_ORIGIN=origin
    await assert.rejects(()=>ruc.lookupRuc('80012345',{fetchImpl:async()=>{throw new Error('must not fetch')}}),e=>e.code==='provider_not_configured'); checks++
  }
  delete process.env.OWNDATA_API_ORIGIN
  process.env.OWNDATA_API_KEY='od_test_TEST_ONLY_NOT_A_REAL_KEY';process.env.NODE_ENV='production'
  await assert.rejects(()=>ruc.lookupRuc('80012345',{fetchImpl:async()=>{throw new Error('must not fetch')}}),e=>e.code==='provider_not_configured'); checks++
  delete process.env.OWNDATA_API_KEY;process.env.NODE_ENV='test'
  for (const [code,status] of [['PLAN_REQUIRED',403],['INSUFFICIENT_SCOPE',403],['REGISTERED_RUC_NOT_FOUND',404],['DAILY_QUOTA_REACHED',429],['COMMERCIAL_API_DISABLED',503]]) {
    await assert.rejects(()=>ruc.lookupRuc('80012345',{fetchImpl:async()=>Response.json({error:{code,message:process.env.RUC_API_KEY}},{status,headers:{'Retry-After':'17'}})}),e=>e.code===code && e.status===status && (status!==429 || e.retryAfterSeconds===17) && !e.message.includes(process.env.RUC_API_KEY)); checks++
  }
  let requested = ''
  const result = await ruc.lookupRuc('80.012.345-0', { fetchImpl: async (url, init) => {
    requested = String(url)
    ok(init.headers.Accept === 'application/json', 'provider accepts JSON')
    ok(init.headers['X-API-Key'] === process.env.RUC_API_KEY, 'exclusive server API key')
    ok(init.method === 'GET' && init.redirect === 'error' && init.cache === 'no-store' && init.credentials === 'omit' && !('Cookie' in init.headers) && !('Authorization' in init.headers), 'fixed safe transport')
    ok(init.signal instanceof AbortSignal, 'timeout signal')
    return Response.json(providerPayload())
  }, now: new Date('2026-09-12T12:00:00.000Z') })
  ok(requested === 'https://app.controlaria.online/api/v1/ruc/80012345-0', 'only normalized RUC leaves the server')
  assert.equal(result.result.name, official); checks++
  assert.equal(result.result.nameOfficial, official); checks++
  assert.equal(result.result.stateRaw, undefined); checks++
  assert.equal(result.result.equivalenceRaw, '  X  '); checks++
  const compatibilityResult = await ruc.lookupRuc('80012345', { fetchImpl: async () => {
    const payload = providerPayload()
    delete payload.data.stateRaw
    payload.data.status = 'ACTIVO'
    return Response.json(payload)
  } })
  assert.equal(compatibilityResult.result.stateRaw, undefined); checks++
  for (const fields of [{ status: 'ACTIVO' }, { status: 'INACTIVO' }, { status: 'SUSPENDIDO' }, { status: 'UNKNOWN' }, { stateRaw: 'INACTIVO' }, {}]) {
    const payload = providerPayload()
    delete payload.data.stateRaw; delete payload.data.equivalenceRaw
    Object.assign(payload.data, fields)
    const admitted = await ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(payload) })
    assert.deepEqual(Object.keys(admitted.result).sort(), ['dv','fullRuc','name','nameOfficial','ruc']); checks++
  }
  for (const mutate of [p => { delete p.meta }, p => { delete p.meta.provenance }, p => { p.meta.environment = 'bad' }, p => { p.meta.quota.remaining = 100 }, p => { p.meta.provenance.sourcePage = 'http://example.test' }, p => { p.meta.provenance.snapshotHash = 'bad' }]) {
    const payload = providerPayload(); mutate(payload)
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(payload) }), e => e.code === 'provider_invalid'); checks++
  }
  for (const [code, status] of [['COMMERCIAL_API_DISABLED',503],['API_KEY_EXPIRED',401],['API_KEY_REVOKED',401],['API_KEY_INVALID',401]]) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json({error:{code,message:process.env.RUC_API_KEY}}, {status}) }), e => e.code === code && e.status === status && !e.message.includes(process.env.RUC_API_KEY)); checks++
  }
  for (const overrides of [{equivalenceRaw: process.env.RUC_API_KEY}, {sourcePartition: process.env.RUC_API_KEY}]) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(providerPayload(overrides)) }), e => e.code === 'provider_invalid'); checks++
  }
  for (const body of ['not JSON', 'x'.repeat(65_537), JSON.stringify({error:{code:process.env.RUC_API_KEY,message:process.env.RUC_API_KEY}}), JSON.stringify({error:{code:'API_KEY_INVALID'}})]) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response(body, {status:503}) }), e => e.code === 'provider_unavailable' && e.status === 503 && !e.message.includes(process.env.RUC_API_KEY)); checks++
  }
  const partitioned = await ruc.lookupRuc('80012345', {fetchImpl: async () => Response.json(providerPayload({sourcePartition:3}))})
  assert.equal(partitioned.result.sourcePartition,3); checks++
  for (const field of ['taxpayerType', 'givenNames', 'surnames', 'nameNatural', 'nameParsing']) ok(!(field in result.result), field + ' is not invented')
  assert.equal(result.reviewRequired, true); checks++
  await assert.rejects(() => ruc.lookupRuc('80012345-0', { fetchImpl: async () => new Response('', { status: 404 }) }), error => error.code === 'not_found'); checks++
  await assert.rejects(() => ruc.lookupRuc('80012345-0', { fetchImpl: async () => { throw new Error('offline') } }), error => error.code === 'provider_unavailable'); checks++
  // Malformed, mismatched and oversized responses cannot become fiscal data.
  for (const overrides of [{ ruc: '80012346' }, { dv: '6' }, { fullRuc: '80012345-6' }, { nameOfficial: '   ' }, { equivalenceRaw: null }, { sourcePartition: '3' }]) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(providerPayload(overrides)) }), e => e.code === 'provider_invalid'); checks++
  }
  const leaked = providerPayload()
  leaked.data.secret = process.env.RUC_API_KEY
  leaked.data.nameNatural = 'guessed'
  leaked.meta.accounting.secret = process.env.RUC_API_KEY
  leaked.meta.secret = process.env.RUC_API_KEY
  leaked.error = { message: process.env.RUC_API_KEY }
  const safe = await ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(leaked) })
  ok(!JSON.stringify(safe).includes(process.env.RUC_API_KEY), 'unknown secret fields removed')
  await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => Response.json(providerPayload({ nameOfficial: process.env.RUC_API_KEY })) }), e => e.code === 'provider_invalid'); checks++
  for (const status of [401, 403, 302, 500]) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response(process.env.RUC_API_KEY, { status }) }), e => e.status === 503 && !e.message.includes(process.env.RUC_API_KEY)); checks++
  }
  for (const retry of ['45', 'secret-provider-diagnostic', '-1', '9007199254740992']) {
    await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response('', { status: 429, headers: { 'Retry-After': retry } }) }), e => e.status === 429 && e.retryAfterSeconds === (retry === '45' ? 45 : undefined)); checks++
  }
  await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response('x'.repeat(65_537)) }), e => e.code === 'provider_invalid'); checks++
  await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response('not json') }), e => e.code === 'provider_invalid'); checks++
  let canceled = false
  await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65_537)) }, cancel() { canceled = true },
  })) }), e => e.code === 'provider_invalid'); checks++
  ok(canceled, 'oversized stream canceled')
  const deadline = new AbortController()
  const blocked = metadata.readBoundedJson(new Response(new ReadableStream({ cancel() { canceled = true } })), deadline.signal)
  deadline.abort()
  await assert.rejects(() => blocked); checks++
  const boundary = JSON.stringify({ pad: 'x'.repeat(65_526) })
  assert.equal(Buffer.byteLength(boundary), 65_536); checks++
  assert.equal((await metadata.readBoundedJson(new Response(boundary), new AbortController().signal)).pad.length, 65_526); checks++
  const nineBase = '123456789'
  const nineDv = String(require('../lib/sifen/cdc.ts').digitoVerificadorModulo11(nineBase))
  let nineUrl = ''
  const nine = await ruc.lookupRuc(nineBase, { fetchImpl: async url => {
    nineUrl = String(url)
    return Response.json(providerPayload({ ruc: nineBase, dv: nineDv, fullRuc: `${nineBase}-${nineDv}` }))
  } })
  assert.equal(nine.result.ruc, nineBase); checks++
  ok(nineUrl.endsWith('/123456789'), 'ninth bare digit remains part of the base')
  // No runtime key means no outbound call even when a legacy key exists.
  delete process.env.RUC_API_KEY
  process.env.RUC_SUN_API_KEY = 'legacy-test-only'
  await assert.rejects(() => ruc.lookupRuc('80012345', { fetchImpl: async () => { throw new Error('MUST NOT FETCH') } }), e => e.code === 'provider_not_configured'); checks++
  process.env.RUC_API_KEY = savedEnvironment.RUC_API_KEY || 'test-only-key-never-a-real-credential'

  // Route harness: all identity/quota/audit/storage operations are mocks.
  process.env.RUC_PILOT_OWNER_EMAIL = 'dariodeoli@gmail.com'
  process.env.RUC_PILOT_USER_ID = 'u1'
  process.env.RUC_PILOT_TENANT_ID = 't1'
  let session = { sessionId: 's1', user: { id: 'u1', tenantId: 't1' } }
  let identity = { id: 'u1', tenantId: 't1', email: 'dariodeoli@gmail.com', tenant: { email: 'dariodeoli@gmail.com', emailVerifiedAt: new Date() } }
  let quotaCalls = 0, fetchCalls = 0, installationCalls = 0, audits = [], installationId, quotaFailure, authFailure
  const route = load('../app/api/ruc/route.ts', {
    '../../../lib/auth': { requireSession: async () => { if (authFailure) throw authFailure; return session } },
    '../../../lib/http': { json: (body) => Response.json(body), error: (message, status, details) => Response.json({ message, details }, { status }) },
    '../../../lib/prisma': { prisma: {
      user: { findFirst: async ({ where, select }) => {
        assert.equal(where.id, session.user.id); assert.equal(where.tenantId, session.user.tenantId)
        assert.equal(select.id, true); assert.equal(select.tenantId, true)
        return identity
      } },
      session: { findUnique: async () => { installationCalls++; return { deviceId: 'device1' } } },
      auditLog: { create: async ({ data }) => { audits.push(data) } },
    } },
    '../../../lib/ruc': { ...ruc, consumeRucQuota: async (account, installation) => {
      quotaCalls++; assert.equal(account, 't1:u1'); installationId = installation
      if (quotaFailure) throw quotaFailure
      return { accountRemaining: 11, installationRemaining: 89 }
    }, lookupRuc: async (input) => { fetchCalls++; return ruc.lookupRuc(input, { fetchImpl: async () => Response.json(providerPayload()) }) } },
  })
  const get = () => route.GET(new Request('https://api.example.test/api/ruc?ruc=80012345&email=dariodeoli%40gmail.com&userId=u1&tenantId=t1', { headers: { 'X-User-Email': 'dariodeoli@gmail.com', 'X-User-Id': 'u1', 'X-Tenant-Id': 't1' } }))
  const expectPrivate = response => ok(response.headers.get('Cache-Control') === 'private, no-store', 'private/no-store response')
  let response = await get(); expectPrivate(response); assert.equal(response.status, 200); checks++
  assert.equal(installationId, 'device1'); checks++
  assert.equal(audits.length, 1); checks++
  ok(!JSON.stringify(audits).includes(official), 'audit does not persist official names')
  const successBody = await response.json()
  assert.equal(successBody.result.name, official); checks++
  assert.deepEqual(successBody.quota, { accountRemaining: 11, installationRemaining: 89 }); checks++
  assert.deepEqual(Object.keys(successBody.result).sort(), ['dv','equivalenceRaw','fullRuc','name','nameOfficial','ruc']); checks++
  const sideEffects = () => [quotaCalls, fetchCalls, audits.length, installationCalls]
  const expectDenied = async (status, code) => {
    const before = sideEffects()
    const denied = await get(); expectPrivate(denied)
    assert.equal(denied.status, status); checks++
    const body = await denied.json()
    assert.equal(body.details.code, code); checks++
    assert.equal(body.details.manualEntryAllowed, true); checks++
    assert.deepEqual(sideEffects(), before); checks++
  }
  for (const rejected of [null, { ...identity, id: 'u2' }, { ...identity, tenantId: 't2' }, { ...identity, email: 'other@example.test' }, { ...identity, email: null }, { ...identity, tenant: { ...identity.tenant, email: 'other@example.test' } }, { ...identity, tenant: { ...identity.tenant, emailVerifiedAt: null } }]) {
    const previous = identity; identity = rejected
    await expectDenied(403, 'pilot_forbidden')
    identity = previous
  }
  // Another authenticated seller with the same owner email cannot spoof IDs
  // through query/header claims; both persisted IDs come from the session.
  for (const user of [{ id: 'u2', tenantId: 't1' }, { id: 'u1', tenantId: 't2' }]) {
    const previousSession = session, previousIdentity = identity
    session = { ...session, user }; identity = { ...identity, ...user }
    await expectDenied(403, 'pilot_forbidden')
    session = previousSession; identity = previousIdentity
  }
  for (const name of ['RUC_PILOT_USER_ID', 'RUC_PILOT_TENANT_ID']) {
    const configured = process.env[name]
    for (const missing of [undefined, '', '   ']) {
      if (missing === undefined) delete process.env[name]; else process.env[name] = missing
      await expectDenied(503, 'pilot_not_configured')
    }
    for (const mismatch of ['another-persisted-id', '*']) {
      process.env[name] = mismatch
      await expectDenied(403, 'pilot_forbidden')
    }
    process.env[name] = configured
  }
  for (const config of [undefined, 'other@example.test', '*']) {
    if (config === undefined) delete process.env.RUC_PILOT_OWNER_EMAIL; else process.env.RUC_PILOT_OWNER_EMAIL = config
    await expectDenied(503, 'pilot_not_configured')
  }
  process.env.RUC_PILOT_OWNER_EMAIL = 'dariodeoli@gmail.com'
  quotaFailure = new Error('DB-CANARY-SECRET')
  const beforeDbFailure = fetchCalls
  const dbDenied = await get()
  assert.equal(dbDenied.status,503); checks++
  assert.equal(fetchCalls,beforeDbFailure); checks++
  assert.ok(!(await dbDenied.text()).includes('CANARY')); checks++
  quotaFailure = new ruc.RucLookupError('account_rate_limited', 'Complete los datos manualmente.', 429, 60)
  response = await get(); expectPrivate(response); assert.equal(response.status, 429); checks++
  assert.equal(response.headers.get('Retry-After'), '60'); checks++
  const limitedBody = await response.json()
  assert.equal(limitedBody.details.manualEntryAllowed, true); checks++
  assert.equal(limitedBody.details.quotaRetryAfter, 60); checks++
  quotaFailure = new ruc.RucLookupError('provider_rate_limited', 'Complete los datos manualmente.', 429, 45)
  response = await get(); expectPrivate(response); assert.equal(response.status, 429); checks++
  assert.equal(response.headers.get('Retry-After'), '45'); checks++
  quotaFailure = null
  session = null
  response = await get(); expectPrivate(response); assert.equal(response.status, 401); checks++
  authFailure = new Error('private database diagnostic')
  response = await get(); expectPrivate(response); assert.equal(response.status, 503); checks++
  ok(!(await response.text()).includes(authFailure.message), 'auth error diagnostics not reflected')
  console.log(`RUC: ${checks} checks OK (normalization, persistent quotas, OwnData mapping, private pilot and fallback).`)
} finally {
  for (const name of Object.keys(process.env)) if (!(name in savedEnvironment)) delete process.env[name]
  Object.assign(process.env, savedEnvironment)
}
