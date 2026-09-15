// Real auth routes + disposable PostgreSQL. Google is simulated with locally signed RSA tokens.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-auth-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/auth_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
const originalFetch = globalThis.fetch
let started = false, prisma, checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks++ }
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'auth_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', e.name, 'migration.sql')))
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'synthetic-test-only', GOOGLE_REDIRECT_URI: 'https://api.example.test/api/auth/google/callback', MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'ab'.repeat(32), WEEM_EMAIL_RELAY_URL: 'https://relay.example.test/api/internal/email/send', WEEM_EMAIL_RELAY_TOKEN: 'synthetic-relay-token', MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID: 'test-v1', MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'test-v1': Buffer.alloc(32, 9).toString('base64') }) })
  require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const oauth = require('../lib/google-oauth.ts')
  const identityConfig = require('../lib/identity.ts')
  const auth = require('../lib/auth.ts')
  const start = require('../app/api/auth/google/route.ts').GET
  const callback = require('../app/api/auth/google/callback/route.ts').GET
  const complete = require('../app/api/auth/google/complete/route.ts').POST
  const finishOnboarding = require('../app/api/auth/onboarding/route.ts').POST
  const pin = require('../app/api/auth/pin/route.ts').POST
  const logout = require('../app/api/auth/logout/route.ts').POST
  const login = require('../app/api/auth/login/route.ts').POST
  const health = require('../app/api/health/route.ts')
  const { middleware } = require('../middleware.ts')
  assert.equal(identityConfig.MOBOS_IDENTITY.urls.api, 'https://api.moboss.online'); checks++
  assert.equal(identityConfig.MOBOS_IDENTITY.urls.app, 'https://app.moboss.online'); checks++
  assert.equal(identityConfig.MOBOS_IDENTITY.urls.website, 'https://moboss.online'); checks++
  assert.equal(identityConfig.MOBOS_IDENTITY.faviconPath, '/favicon.ico'); checks++
  assert.equal(identityConfig.MOBOS_IDENTITY.faviconType, 'image/x-icon'); checks++
  assert.equal(identityConfig.MOBOS_IDENTITY_HEADERS.Link, '</favicon.ico>; rel="icon"; type="image/x-icon"'); checks++
  assert.deepEqual(readFileSync(join(backend, 'app/favicon.ico')), readFileSync(join(dirname(backend), 'public/favicon.ico'))); checks++
  const canonicalCors = middleware(new Request('https://api.moboss.online/api/health', { method: 'OPTIONS', headers: { Origin: 'https://app.moboss.online' } }))
  assert.equal(canonicalCors.headers.get('access-control-allow-origin'), 'https://app.moboss.online'); checks++
  assert.equal(canonicalCors.headers.get('link'), identityConfig.MOBOS_IDENTITY_HEADERS.Link); checks++
  const legacyCors = middleware(new Request('https://api.moboss.online/api/health', { method: 'OPTIONS', headers: { Origin: 'https://app.controlaria.online' } }))
  assert.equal(legacyCors.headers.get('access-control-allow-origin'), null); checks++
  const legacyApi = middleware(new Request('https://api.controlaria.online/api/health', { headers: { Host: 'api.controlaria.online' } }))
  assert.equal(legacyApi.status, 308); checks++
  assert.equal(legacyApi.headers.get('location'), 'https://api.moboss.online/api/health'); checks++
  process.env.NODE_ENV = 'production'
  process.env.GOOGLE_REDIRECT_URI = 'https://api.controlaria.online/api/auth/google/callback'
  process.env.MOBOS_APP_URL = 'https://app.controlaria.online'
  assert.throws(() => oauth.authConfig(), error => error?.code === 'not_configured'); checks++
  process.env.GOOGLE_REDIRECT_URI = 'https://api.moboss.online/api/auth/google/callback'
  process.env.MOBOS_APP_URL = 'https://app.moboss.online'
  assert.equal(oauth.authConfig().callback, 'https://api.moboss.online/api/auth/google/callback'); checks++
  Object.assign(process.env, { NODE_ENV: 'test', GOOGLE_REDIRECT_URI: 'https://api.example.test/api/auth/google/callback', MOBOS_APP_URL: 'https://app.example.test' })
  const healthResponse = await health.GET()
  const healthBody = await healthResponse.json()
  assert.equal(healthResponse.status, 200); checks++
  assert.equal(healthResponse.headers.get('content-type'), 'application/json'); checks++
  assert.equal(healthResponse.headers.get('link'), identityConfig.MOBOS_IDENTITY_HEADERS.Link); checks++
  assert.equal(healthBody.ok, true); checks++
  assert.equal(healthBody.service, identityConfig.MOBOS_IDENTITY.apiService); checks++
  assert.equal(healthBody.services.api, 'operational'); checks++
  assert.equal(healthBody.services.database, 'operational'); checks++
  assert.equal(healthBody.services.email, 'configured'); checks++
  const relayToken = process.env.WEEM_EMAIL_RELAY_TOKEN
  delete process.env.WEEM_EMAIL_RELAY_TOKEN
  const emailUnconfiguredBody = await (await health.GET()).json()
  assert.equal(emailUnconfiguredBody.services.email, 'unconfigured'); checks++
  process.env.WEEM_EMAIL_RELAY_TOKEN = relayToken
  const outboxKeys = process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON
  delete process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON
  assert.equal((await health.GET().then(response => response.json())).services.email, 'unconfigured'); checks++
  process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON = outboxKeys
  const originalHealthQuery = prisma.$queryRaw
  prisma.$queryRaw = async () => { throw new Error('synthetic database failure') }
  const unhealthyResponse = await health.GET()
  const unhealthyBody = await unhealthyResponse.json()
  prisma.$queryRaw = originalHealthQuery
  assert.equal(unhealthyResponse.status, 503); checks++
  assert.equal(unhealthyResponse.headers.get('content-type'), 'application/json'); checks++
  assert.equal(unhealthyResponse.headers.get('link'), identityConfig.MOBOS_IDENTITY_HEADERS.Link); checks++
  assert.equal(unhealthyBody.ok, false); checks++
  assert.equal(unhealthyBody.services.api, 'operational'); checks++
  assert.equal(unhealthyBody.services.database, 'unavailable'); checks++
  assert.equal(unhealthyBody.services.email, 'configured'); checks++
  const healthHead = health.HEAD()
  assert.equal(healthHead.status, 200); checks++
  assert.equal(await healthHead.text(), ''); checks++
  assert.equal(healthHead.headers.get('link'), identityConfig.MOBOS_IDENTITY_HEADERS.Link); checks++
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }
  function jwt(nonce, extra = {}, signingKey = privateKey) {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid })).toString('base64url')
    const claims = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'test-client', sub: 'google-one', email: 'one@example.test', email_verified: true, name: 'Persona', nonce, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+600, ...extra })).toString('base64url')
    return `${head}.${claims}.${sign('RSA-SHA256', Buffer.from(`${head}.${claims}`), signingKey).toString('base64url')}`
  }
  let expectedFlow, tokenClaims = {}, tokenUsed = false
  const emailDeliveries = []
  let emailRelayOk = true
  globalThis.fetch = async (url, options) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [key] })
    if (url === process.env.WEEM_EMAIL_RELAY_URL) { emailDeliveries.push({ headers: options.headers, body: JSON.parse(options.body) }); return Response.json({ ok: emailRelayOk }, { status: emailRelayOk ? 200 : 503 }) }
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    assert.equal(options.body.get('code_verifier'), expectedFlow.verifier)
    assert.equal(options.body.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI)
    if (tokenUsed) return Response.json({ error: 'invalid_grant' }, { status: 400 })
    tokenUsed = true
    return Response.json({ id_token: jwt(expectedFlow.nonce, tokenClaims) })
  }
  const makeReq = (path, body, cookie = '', origin = process.env.MOBOS_APP_URL, headers = {}) => new Request(`https://api.example.test${path}`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  async function post(handler, body, cookie = '', status = 200, origin, headers) {
    const res = await handler(makeReq('/api/auth/test', body, cookie, origin, headers)); const data = await res.json()
    assert.equal(res.status, status, JSON.stringify(data)); checks++; return { res, data }
  }
  const cookie = (res, name) => `${name}=${res.cookies.get(name)?.value || ''}`
  async function identity(intent = 'create', claims = {}) {
    const res = await start(new Request(`https://api.example.test/api/auth/google?intent=${intent}`))
    const url = new URL(res.headers.get('location'))
    expectedFlow = oauth.unseal('flow', res.cookies.get(oauth.COOKIE_FLOW).value)
    ok(url.searchParams.get('code_challenge') === createHash('sha256').update(expectedFlow.verifier).digest('base64url'), 'PKCE S256')
    ok(url.searchParams.get('state') === expectedFlow.state && url.searchParams.get('nonce') === expectedFlow.nonce, 'state and nonce')
    ok(res.headers.get('set-cookie').includes('HttpOnly') && res.headers.get('set-cookie').includes('Secure') && res.headers.get('set-cookie').includes('SameSite=lax'), 'secure flow cookie')
    tokenClaims = claims; tokenUsed = false
    const cbUrl = `https://api.example.test/api/auth/google/callback?code=synthetic&state=${expectedFlow.state}`
    const request = new Request(cbUrl, { headers: { Cookie: cookie(res, oauth.COOKIE_FLOW) } })
    const cb = await callback(request)
    ok(cb.headers.get('location') === 'https://app.example.test/login?google=ready', 'callback success without credentials in URL')
    const replay = await callback(request)
    ok(new URL(replay.headers.get('location')).searchParams.has('auth_error'), 'provider rejects code replay')
    return cookie(cb, oauth.COOKIE_IDENTITY)
  }
  delete process.env.GOOGLE_CLIENT_SECRET
  ok((await start(new Request('https://api.example.test/api/auth/google'))).status === 503, 'missing config fails closed')
  process.env.GOOGLE_CLIENT_SECRET = 'synthetic-test-only'
  const startResponse = await start(new Request('https://api.example.test/api/auth/google'))
  const badState = await callback(new Request('https://api.example.test/api/auth/google/callback?code=x&state=wrong', { headers: { Cookie: cookie(startResponse, oauth.COOKIE_FLOW) } }))
  ok(new URL(badState.headers.get('location')).searchParams.get('auth_error') === 'state', 'state mismatch')
  const noCookie = await callback(new Request('https://api.example.test/api/auth/google/callback?code=x&state=x'))
  ok(new URL(noCookie.headers.get('location')).searchParams.has('auth_error'), 'state requires browser cookie')
  const sealed = oauth.seal('identity', { sub: 'x' })
  assert.throws(() => oauth.unseal('flow', sealed)); checks++
  assert.throws(() => oauth.unseal('identity', `${sealed.slice(0,-3)}aaa`)); checks++
  const realNow = Date.now
  Date.now = () => realNow() + 601_000
  assert.throws(() => oauth.unseal('identity', sealed)); checks++
  Date.now = realNow
  ok(!oauth.validGoogleFlow({ state: 'short', verifier: 'short', nonce: 'short', intent: 'login' }), 'malformed OAuth flow is rejected before exchange')
  for (const bad of [{ email_verified: false }, { aud: 'other' }, { iss: 'https://evil.test' }, { nonce: 'other' }, { exp: 1 }, { sub: '' }, { azp: 'other' }]) {
    await assert.rejects(() => oauth.verifyGoogleToken(jwt('nonce', bad), 'nonce')); checks++
  }
  await assert.rejects(() => oauth.verifyGoogleToken(jwt('nonce', {}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), 'nonce')); checks++
  const idCookie = await identity()
  await post(complete, { action: 'login' }, idCookie, 403, 'https://evil.test')
  await post(complete, { action: 'login' }, idCookie, 409)
  await post(complete, { action: 'create' }, idCookie, 400)
  ok(await prisma.tenant.count() === 0, 'invalid signup creates nothing')
  const signup = { action: 'create', companyName: 'Tienda A', tenantId: 'attacker', role: 'ADMIN' }
  emailRelayOk = false
  const created = await post(complete, signup, idCookie)
  const companyCookie = cookie(created.res, oauth.COOKIE_COMPANY)
  const tenantId = created.data.tenant.id
  const createdTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  ok(createdTenant.emailVerifiedAt instanceof Date, 'Google signup persists verified email timestamp')
  const welcomeJob = await prisma.emailOutbox.findFirst({ where: { kind: 'welcome', aggregateType: 'Tenant', aggregateId: tenantId } })
  const welcomeKey = welcomeJob.idempotencyKey
  ok(/^mobos-outbox-[0-9a-f-]{36}$/i.test(welcomeKey) && emailDeliveries.filter(item => item.headers['Idempotency-Key'] === welcomeKey).length === 1 && createdTenant.welcomeEmailSentAt === null, 'failed Google welcome remains retryable with an independent stable outbox key')
  emailRelayOk = true
  let admin = await prisma.user.findFirst({ where: { tenantId } })
  ok(admin.role === 'ADMIN' && tenantId !== 'attacker' && created.data.sellers.length === 1, 'isolated admin from trusted tenant')
  ok(created.data.onboardingRequired === true, 'Google signup defers the administrator PIN')
  ok(!created.data.companyToken && !created.data.accessToken && created.res.headers.get('set-cookie').includes('HttpOnly'), 'company session only in cookie')
  ok(await prisma.order.count() === 0 && await prisma.product.count() === 0, 'new tenant starts empty')
  const companyToken = created.res.cookies.get(oauth.COOKIE_COMPANY).value
  ok(!!await prisma.session.findUnique({ where: { tokenHash: auth.hashToken(companyToken) } }), 'stored session hashed')
  await post(pin, { sellerId: admin.id, pin: '7391' }, companyCookie, 401, 'https://evil.test')
  await post(pin, { sellerId: admin.id, pin: '7391' }, companyCookie, 401)
  await post(finishOnboarding, { pin: '7391' }, companyCookie)
  ok(!!await prisma.auditLog.findFirst({ where: { tenantId, action: 'ONBOARDING_ADMIN_PIN_CONFIGURED' } }), 'initial PIN setup is audited')
  admin = await prisma.user.findFirst({ where: { tenantId } })
  const signedIn = await post(pin, { sellerId: admin.id, pin: '7391', tenantId: 'attacker' }, companyCookie)
  ok(signedIn.data.user.tenantId === tenantId && signedIn.data.user.role === 'ADMIN', 'cookie to PIN correct company')
  ok(auth.hasPermission(signedIn.data.user, 'orders:manage') && !auth.hasPermission({ permissions: ['products:read'] }, 'orders:manage'), 'server permission helper only accepts effective grants')
  const scheduled = await prisma.user.create({ data: { tenantId, name: 'Fuera de horario', pinHash: admin.pinHash, role: 'VENDEDOR', accessSchedule: { timezone: 'America/Asuncion', windows: [] } } })
  await post(pin, { sellerId: scheduled.id, pin: '7391' }, companyCookie, 401)
  ok(!!await prisma.auditLog.findFirst({ where: { userId: scheduled.id, action: 'SELLER_SCHEDULE_DENIED' } }), 'schedule denial is audited server-side')
  const locked = await prisma.user.create({ data: { tenantId, name: 'Bloqueable', pinHash: admin.pinHash, role: 'VENDEDOR' } })
  for (let index = 0; index < 5; index++) await post(pin, { sellerId: locked.id, pin: '0000' }, companyCookie, 401)
  await post(pin, { sellerId: locked.id, pin: '7391' }, companyCookie, 401)
  const lockedRecord = await prisma.user.findUnique({ where: { id: locked.id }, select: { lockedUntil: true, failedLoginAttempts: true } })
  ok(lockedRecord.lockedUntil > new Date() && lockedRecord.failedLoginAttempts === 5, 'PIN locks after five failures and rejects the correct code during lock')
  ok(!!await prisma.auditLog.findFirst({ where: { userId: locked.id, action: 'SELLER_PIN_LOCKED' } }), 'PIN lock is auditable')
  await prisma.tenant.create({ data: { id: 'other', name: 'Other', slug: 'other', email: 'existing@example.test' } })
  const foreign = await prisma.user.create({ data: { tenantId: 'other', name: 'Other', pinHash: admin.pinHash, role: 'VENDEDOR' } })
  await post(pin, { sellerId: foreign.id, pin: '7391' }, companyCookie, 401)
  await post(login, { email: 'one@example.test', password: 'password-not-configured', deviceId: 'password-test' }, '', 401)
  process.env.MOBOS_TRUST_PROXY = 'true'
  for (let index = 0; index < 20; index++) await post(login, { email: 'one@example.test', password: 'wrong-password', deviceId: `rate-${index}` }, '', 401, undefined, { 'X-Forwarded-For': '203.0.113.7' })
  await post(login, { email: 'one@example.test', password: 'wrong-password', deviceId: 'rate-last' }, '', 429, undefined, { 'X-Forwarded-For': '203.0.113.7' })
  ok(await prisma.authAttempt.count({ where: { scope: 'company-login' } }) === 20, 'proxy-verified source is persistently rate limited')
  delete process.env.MOBOS_TRUST_PROXY
  const again = await post(complete, { action: 'login' }, await identity('login', { email: 'changed@example.test' }))
  ok(again.data.tenant.id === tenantId && await prisma.tenant.count() === 2, 'stable sub login, no new tenant or privilege changes')
  ok(emailDeliveries.filter(item => item.headers['Idempotency-Key'] === welcomeKey).length === 1 && (await prisma.tenant.findUnique({ where: { id: tenantId } })).welcomeEmailSentAt === null, 'user-triggered welcome dispatch respects retry backoff')
  await prisma.emailOutbox.update({ where: { id: welcomeJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } })
  await post(complete, { action: 'login' }, await identity('login', { email: 'changed-again@example.test' }))
  ok(emailDeliveries.filter(item => item.headers['Idempotency-Key'] === welcomeKey).length === 2 && (await prisma.tenant.findUnique({ where: { id: tenantId } })).welcomeEmailSentAt instanceof Date, 'due Google welcome retries once and is not sent again after success')
  await post(complete, signup, await identity('create', { sub: 'unlinked', email: 'existing@example.test' }), 409)
  ok(await prisma.googleIdentity.count() === 1 && (await prisma.user.findUnique({ where: { id: foreign.id } })).role === 'VENDEDOR', 'no email linking or promotion')
  const concurrentCookie = await identity('create', { sub: 'concurrent', email: 'concurrent@example.test' })
  const concurrent = await Promise.all([complete(makeReq('/api/auth/google/complete', signup, concurrentCookie)), complete(makeReq('/api/auth/google/complete', signup, concurrentCookie))])
  ok(concurrent.some(r => r.status === 200) && concurrent.every(r => [200,409].includes(r.status)), 'concurrent signup safe')
  ok(await prisma.googleIdentity.count({ where: { subject: 'concurrent' } }) === 1 && await prisma.tenant.count() === 3, 'no orphan or duplicate tenants after race')
  await post(logout, {}, companyCookie, 403, 'https://evil.test')
  const exited = await post(logout, {}, companyCookie)
  ok(exited.res.cookies.get(oauth.COOKIE_COMPANY).value === '' && exited.res.headers.get('set-cookie').includes('Max-Age=0'), 'logout clears cookie')
  await post(pin, { sellerId: admin.id, pin: '7391' }, companyCookie, 401)
  ok((await prisma.session.findUnique({ where: { tokenHash: auth.hashToken(companyToken) } })).revokedAt !== null, 'logout revokes company token')
  await post(logout, {}, '', 200, undefined, { Authorization: `Bearer ${signedIn.data.accessToken}` })
  ok(await auth.requireSession(new Request('https://api.example.test/api/auth/me', { headers: { Authorization: `Bearer ${signedIn.data.accessToken}` } })) === null, 'seller logout remains valid')
  console.log(`Auth Google: ${checks} checks OK (real routes, disposable PostgreSQL; simulated Google).`)
} finally {
  globalThis.fetch = originalFetch
  if (prisma) await prisma.$disconnect()
  if (started) run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
}
