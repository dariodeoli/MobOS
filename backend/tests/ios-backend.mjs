// App de iPhone: token nativo, CORS de Capacitor, /api/config, Apple, Google nativo,
// push (APNs) y borrado de cuenta con reautenticación. Rutas reales + PostgreSQL
// desechable; Apple/Google/APNs se simulan (JWKS firmado localmente, fetch y HTTP/2 falsos).
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
const bcrypt = require('bcryptjs')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-ios-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/ios_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
const originalFetch = globalThis.fetch
const GOOGLE_IOS = '500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh.apps.googleusercontent.com'
let started = false, prisma, checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks++ }
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++ }

try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'ios_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', e.name, 'migration.sql')))

  const ec = () => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  Object.assign(process.env, {
    DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_TRUST_PROXY: 'true',
    MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'ab'.repeat(32),
    MOBOS_APPLE_CLIENT_IDS: 'online.moboss.app', MOBOS_APPLE_TEAM_ID: 'F65VS7VHB9', MOBOS_APPLE_KEY_ID: 'APPLEKEY01', MOBOS_APPLE_PRIVATE_KEY: ec(),
    MOBOS_GOOGLE_IOS_CLIENT_ID: GOOGLE_IOS,
    MOBOS_APNS_KEY_ID: 'APNSKEY001', MOBOS_APNS_TEAM_ID: 'F65VS7VHB9', MOBOS_APNS_PRIVATE_KEY: ec(), MOBOS_APNS_TOPIC: 'online.moboss.app',
    MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID: 'test-v1', MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'test-v1': Buffer.alloc(32, 9).toString('base64') }),
  })
  require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { middleware } = require('../middleware.ts')
  const login = require('../app/api/auth/login/route.ts').POST
  const pin = require('../app/api/auth/pin/route.ts').POST
  const apple = require('../app/api/auth/apple/route.ts').POST
  const googleNative = require('../app/api/auth/google/native/route.ts').POST
  const config = require('../app/api/config/route.ts').GET
  const devices = require('../app/api/push/devices/route.ts')
  const deleteMe = require('../app/api/me/route.ts').DELETE
  const apns = require('../lib/apns.ts')
  const push = require('../lib/web-push.ts')
  const nativeClient = require('../lib/native-client.ts')
  const nonceRoute = require('../app/api/auth/nonce/route.ts').POST
  const authNonce = require('../lib/auth-nonce.ts')
  const jwks = require('../lib/jwks.ts')
  const checks_ = require('../app/api/system/checks/route.ts').GET
  const appleLib = require('../lib/apple-auth.ts')
  const { hashToken } = require('../lib/auth.ts')

  // ── Proveedores simulados ──────────────────────────────────────────────────
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = kid => ({ ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' })
  const rsaJwt = (claims, kid = 'kid-1', key = privateKey) => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`
  }
  const now = () => Math.floor(Date.now() / 1000)
  // Nonces fijos que se siembran en la base (el endpoint real se prueba aparte): hash + propósito + vencimiento por reloj de Postgres.
  const GN = 'ef'.repeat(32), GR = '12'.repeat(32), AR = '34'.repeat(32)
  const seedNonce = (raw, purpose = 'login') => prisma.$executeRaw`INSERT INTO "AuthNonce" ("id", "tokenHash", "purpose", "expiresAt") VALUES (${`seed-${raw.slice(0, 8)}-${purpose}`}, ${hashToken(raw)}, ${purpose}, now() + interval '5 minutes') ON CONFLICT ("tokenHash") DO UPDATE SET "purpose" = EXCLUDED."purpose", "expiresAt" = EXCLUDED."expiresAt"`
  const appleCalls = []
  globalThis.fetch = async (url, init) => {
    const target = String(url)
    if (target === 'https://appleid.apple.com/auth/keys' || target === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk('kid-1')] })
    if (target === 'https://appleid.apple.com/auth/token') {
      appleCalls.push({ url: target, form: Object.fromEntries(new URLSearchParams(String(init.body))) })
      return Response.json({ refresh_token: 'apple-refresh-secret', access_token: 'x' })
    }
    if (target === 'https://appleid.apple.com/auth/revoke') {
      appleCalls.push({ url: target, form: Object.fromEntries(new URLSearchParams(String(init.body))) })
      return new Response('', { status: 200 })
    }
    throw new Error(`fetch inesperado: ${target}`)
  }
  const appleToken = (sub, nonce, extra = {}) => rsaJwt({ iss: 'https://appleid.apple.com', aud: 'online.moboss.app', sub, exp: now() + 600, iat: now(), nonce: createHash('sha256').update(nonce).digest('hex'), ...extra })
  const googleToken = (sub, email, extra = {}) => rsaJwt({ iss: 'https://accounts.google.com', aud: GOOGLE_IOS, azp: GOOGLE_IOS, sub, email, email_verified: true, name: 'Persona Google', exp: now() + 600, iat: now(), nonce: GN, ...extra })

  const NATIVE = { 'X-MobOS-Client': 'ios/1.0.0', Origin: 'capacitor://localhost' }
  let ipCounter = 0
  const call = async (handler, { body, headers = {}, method = 'POST', path = '/api/x', bearer, ip } = {}) => {
    const h = { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...headers }
    if (bearer) h.Authorization = `Bearer ${bearer}`
    const res = await handler(new Request(`https://api.example.test${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }))
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  // ── Contrato de cliente nativo (puro) ──────────────────────────────────────
  const mk = (headers) => new Request('https://api.example.test/x', { headers })
  ok(nativeClient.isNativeClient(mk({ 'x-mobos-client': 'ios/1.2.3' })), 'header ios sin origen = nativo (HTTP nativo)')
  ok(nativeClient.isNativeClient(mk({ 'x-mobos-client': 'ios/1.2.3', origin: 'capacitor://localhost' })), 'WebView de Capacitor = nativo')
  ok(!nativeClient.isNativeClient(mk({ 'x-mobos-client': 'ios/1.2.3', origin: 'https://app.moboss.online' })), 'el header desde la web NO activa el modo nativo')
  ok(!nativeClient.isNativeClient(mk({ 'x-mobos-client': 'android/1' })) && !nativeClient.isNativeClient(mk({})), 'sin header válido no es nativo')
  ok(nativeClient.versionAtLeast('1.10.0', '1.9.9') && !nativeClient.versionAtLeast('1.0.0', '1.0.1'), 'comparación de versiones')

  // ── CORS de Capacitor + /api/config ────────────────────────────────────────
  for (const origin of ['capacitor://localhost', 'ionic://localhost']) {
    const pre = await middleware(new Request('https://api.moboss.online/api/auth/login', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'x-mobos-client,authorization' } }))
    ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === origin, `CORS permite ${origin}`)
    ok(/x-mobos-client/i.test(pre.headers.get('access-control-allow-headers')) && /authorization/i.test(pre.headers.get('access-control-allow-headers')), 'CORS permite X-MobOS-Client y Authorization')
  }
  const foreign = await middleware(new Request('https://api.moboss.online/api/health', { method: 'OPTIONS', headers: { Origin: 'capacitor://otra' } }))
  ok(foreign.headers.get('access-control-allow-origin') === null, 'otro origen capacitor no se permite')
  process.env.MOBOS_IOS_MIN_VERSION = '1.2.0'
  const cfg = await (await config()).json()
  eq(cfg.minVersion, { ios: '1.2.0' }, '/api/config devuelve la versión mínima de iOS')
  ok(/^https:\/\/.+/.test(cfg.supportUrl) && /privacidad/.test(cfg.privacyUrl) && /terminos/.test(cfg.termsUrl), '/api/config trae enlaces legales')
  delete process.env.MOBOS_IOS_MIN_VERSION

  // ── Fixtures: tienda con contraseña + dueño ADMIN ──────────────────────────
  const passwordHash = await bcrypt.hash('Tienda-Segura-123', 4)
  const mkStore = async (n, email) => {
    const tenant = await prisma.tenant.create({ data: { name: `Tienda ${n}`, email, emailVerifiedAt: new Date(), slug: `tienda-ios-${n}`, passwordHash } })
    const admin = await prisma.user.create({ data: { tenantId: tenant.id, name: `Admin ${n}`, email, pinHash: await bcrypt.hash('4821', 4), pinLength: 4, role: 'ADMIN' } })
    return { tenant, admin }
  }
  const A = await mkStore('a', 'dueno-a@example.test')

  // ── Login / PIN: token en el cuerpo SOLO para nativos ──────────────────────
  const web = await call(login, { body: { email: 'dueno-a@example.test', password: 'Tienda-Segura-123', deviceId: 'web-device' }, headers: { Origin: 'https://app.example.test' } })
  ok(web.res.status === 200 && web.data.token === undefined && /mobos_company_session=/.test(web.res.headers.get('set-cookie') || ''), 'web: cookie y sin token en el cuerpo')
  const spoof = await call(login, { body: { email: 'dueno-a@example.test', password: 'Tienda-Segura-123', deviceId: 'web-device' }, headers: { ...NATIVE, Origin: 'https://app.moboss.online' } })
  ok(spoof.data.token === undefined, 'header nativo desde un origen web no entrega token')
  const nat = await call(login, { body: { email: 'dueno-a@example.test', password: 'Tienda-Segura-123', deviceId: 'ios-device' }, headers: NATIVE })
  ok(nat.res.status === 200 && /^[a-f0-9]{64}$/.test(nat.data.token) && nat.data.expiresAt && !nat.res.headers.get('set-cookie'), 'nativo: token de 64 hex en el cuerpo y sin cookie')
  const companyToken = nat.data.token
  const sellerLogin = await call(pin, { body: { sellerId: A.admin.id, pin: '4821' }, headers: NATIVE, bearer: companyToken })
  ok(sellerLogin.res.status === 200 && /^[a-f0-9]{64}$/.test(sellerLogin.data.sellerToken) && sellerLogin.data.expiresAt && !sellerLogin.res.headers.get('set-cookie'), 'PIN nativo: sellerToken en el cuerpo')
  const webPin = await call(pin, { body: { sellerId: A.admin.id, pin: '4821' }, bearer: companyToken })
  ok(webPin.data.sellerToken === undefined && /mobos_seller_session=/.test(webPin.res.headers.get('set-cookie') || ''), 'PIN web: cookie, sin token en el cuerpo')
  const sellerToken = sellerLogin.data.sellerToken
  const account = await prisma.account.findUnique({ where: { email: 'dueno-a@example.test' } })
  ok(account, 'el login por contraseña dejó la cuenta del dueño')

  // ── Push: alta y baja de dispositivos ──────────────────────────────────────
  const T1 = 'a'.repeat(64), T2 = 'b'.repeat(64)
  eq((await call(devices.POST, { body: { token: T1 } })).res.status, 401, 'registrar sin sesión = 401')
  eq((await call(devices.POST, { body: { token: 'zz' }, bearer: sellerToken })).res.status, 400, 'token inválido = 400')
  const reg = await call(devices.POST, { body: { token: T1, environment: 'sandbox' }, bearer: sellerToken, headers: NATIVE })
  ok(reg.res.status === 200 && (await prisma.deviceToken.findUnique({ where: { token: T1 } }))?.environment === 'sandbox', 'registra el token (sandbox)')
  await call(devices.POST, { body: { token: T1.toUpperCase(), environment: 'sandbox' }, bearer: sellerToken })
  eq(await prisma.deviceToken.count(), 1, 'reenviar el mismo token no duplica (se normaliza)')
  await call(devices.POST, { body: { token: T2 }, bearer: sellerToken })
  eq((await prisma.deviceToken.findUnique({ where: { token: T2 } })).environment, 'production', 'por defecto production')

  // ── APNs: fan-out, topic, host por ambiente, 410 poda, sin config = no-op ──
  const sent = []
  let reply = () => ({ status: 200, body: '' })
  apns.setApnsTransportForTests(async (host, reqs) => { sent.push({ host, reqs }); return reqs.map((r, i) => reply(r, i)) })
  const out = await push.enviarWebPush({ tenantId: A.tenant.id, userId: A.admin.id, titulo: 'Hola', cuerpo: 'Mundo', url: '/pedidos/1', tag: 't-1', urgente: true })
  ok(out.configurado === true && out.apns.enviados === 2, 'enviarWebPush también sale por APNs')
  ok(sent.length === 2 && sent.some(s => s.host === 'api.sandbox.push.apple.com') && sent.some(s => s.host === 'api.push.apple.com'), 'sandbox y production van a su host')
  const first = sent[0].reqs[0]
  ok(first.headers['apns-topic'] === 'online.moboss.app' && first.headers['apns-priority'] === '10' && /^bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(first.headers.authorization), 'topic, prioridad y JWT ES256')
  ok(JSON.parse(first.body).aps.alert.title === 'Hola' && JSON.parse(first.body).url === '/pedidos/1', 'payload genérico con ruta interna')
  ok(!JSON.stringify(sent).includes(companyToken) && !JSON.stringify(sent).includes(sellerToken), 'ningún token de sesión viaja en APNs')
  reply = (r) => r.headers[':path'].endsWith(T1) ? { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) } : { status: 200, body: '' }
  const pruned = await push.enviarWebPush({ tenantId: A.tenant.id, userId: A.admin.id, titulo: 'x' })
  ok(pruned.apns.podados === 1 && !(await prisma.deviceToken.findUnique({ where: { token: T1 } })) && !!(await prisma.deviceToken.findUnique({ where: { token: T2 } })), '410 elimina solo el token muerto')
  reply = () => ({ status: 500, body: JSON.stringify({ reason: 'InternalServerError' }) })
  const failed = await push.enviarWebPush({ tenantId: A.tenant.id, userId: A.admin.id })
  ok(failed.apns.fallidos === 1 && !!(await prisma.deviceToken.findUnique({ where: { token: T2 } })), 'un 500 no borra el token')
  const savedTopic = process.env.MOBOS_APNS_TOPIC
  delete process.env.MOBOS_APNS_TOPIC
  sent.length = 0
  const noop = await push.enviarWebPush({ tenantId: A.tenant.id, userId: A.admin.id })
  ok(noop.apns.configurado === false && sent.length === 0, 'sin variables de APNs: no-op')
  process.env.MOBOS_APNS_TOPIC = savedTopic
  const del = await call(devices.DELETE, { body: { token: T2 }, bearer: sellerToken })
  ok(del.data.borrados === 1 && (await prisma.deviceToken.count()) === 0, 'DELETE quita el token')
  apns.setApnsTransportForTests(null)


  // ── Nonce emitido por el servidor ──────────────────────────────────────────
  eq((await call(nonceRoute, { body: {} })).res.status, 400, 'el nonce exige cliente nativo')
  const issued = await call(nonceRoute, { body: {}, headers: NATIVE })
  ok(issued.res.status === 200 && /^[a-f0-9]{64}$/.test(issued.data.nonce) && issued.data.expiresInSeconds === 300 && issued.res.headers.get('cache-control') === 'no-store', 'POST /api/auth/nonce: 64 hex, 300 s, no-store')
  const stored = await prisma.$queryRaw`SELECT "tokenHash", "purpose", "expiresAt" > now() AS vivo, "expiresAt" < now() + interval '301 seconds' AS corto FROM "AuthNonce" WHERE "tokenHash" = ${hashToken(issued.data.nonce)}`
  ok(stored.length === 1 && stored[0].purpose === 'login' && stored[0].vivo && stored[0].corto && stored[0].tokenHash !== issued.data.nonce, 'en la base solo sha256, propósito y TTL de 5 min (reloj de Postgres)')
  eq((await prisma.$queryRaw`SELECT 1 FROM "AuthNonce" WHERE "tokenHash" = ${issued.data.nonce}`).length, 0, 'el nonce crudo nunca se guarda')
  eq((await call(nonceRoute, { body: { purpose: 'reauth' }, headers: NATIVE })).res.status, 200, 'purpose reauth')
  // Un solo uso, propósito, vencimiento y carrera.
  ok(!(await authNonce.consumeAuthNonce(issued.data.nonce, 'reauth')), 'un nonce de login no se consume como reauth')
  ok(await authNonce.consumeAuthNonce(issued.data.nonce, 'login'), 'se consume una vez')
  ok(!(await authNonce.consumeAuthNonce(issued.data.nonce, 'login')), 'y no una segunda')
  ok(!(await authNonce.consumeAuthNonce('zz', 'login')) && !(await authNonce.consumeAuthNonce(undefined, 'login')), 'formato inválido se rechaza sin consultar')
  const racing = (await call(nonceRoute, { body: {}, headers: NATIVE })).data.nonce
  const raced = await Promise.all([authNonce.consumeAuthNonce(racing, 'login'), authNonce.consumeAuthNonce(racing, 'login'), authNonce.consumeAuthNonce(racing, 'login')])
  eq(raced.filter(Boolean).length, 1, 'tres consumos simultáneos: gana exactamente uno')
  const stale = (await call(nonceRoute, { body: {}, headers: NATIVE })).data.nonce
  await prisma.$executeRaw`UPDATE "AuthNonce" SET "expiresAt" = now() - interval '1 second' WHERE "tokenHash" = ${hashToken(stale)}`
  ok(!(await authNonce.consumeAuthNonce(stale, 'login')), 'un nonce vencido no se consume')
  // Rate limit del endpoint.
  let lastNonce
  for (let i = 0; i < 31; i += 1) lastNonce = await call(nonceRoute, { body: {}, headers: NATIVE, ip: '203.0.113.50' })
  eq(lastNonce.res.status, 429, 'rate limit en /auth/nonce')
  // Apple con nonce real del servidor: sirve una vez; el token repetido (replay) falla.
  const realNonce = (await call(nonceRoute, { body: {}, headers: NATIVE })).data.nonce
  const replayToken = appleToken('replay-sub', realNonce, { email: 'nadie@example.test', email_verified: 'true' })
  eq((await call(apple, { body: { identityToken: replayToken, nonce: realNonce }, headers: NATIVE })).res.status, 403, 'Apple con nonce del servidor: verifica (sigue sin tienda = 403)')
  eq((await call(apple, { body: { identityToken: replayToken, nonce: realNonce }, headers: NATIVE })).res.status, 401, 'replay del mismo identityToken = 401')
  eq((await call(apple, { body: { identityToken: appleToken('replay-sub', 'ab12'.repeat(16)), nonce: 'ab12'.repeat(16) }, headers: NATIVE })).res.status, 401, 'nonce que el servidor no emitió = 401')
  eq((await call(apple, { body: { identityToken: appleToken('replay-sub', 'corto'), nonce: 'corto' }, headers: NATIVE })).res.status, 401, 'nonce con formato inválido = 401')
  // Proveedor caído: 503, no 401.
  const nonce = 'ab'.repeat(32)
  const appleCall = async (identityToken, extra = {}, opts = {}) => { await seedNonce(nonce); return call(apple, { body: { identityToken, nonce, ...extra }, headers: NATIVE, ...opts }) }
  const gCall = async (idToken, extra = {}, opts = {}) => { await seedNonce(GN); return call(googleNative, { body: { idToken, nonce: GN, ...extra }, headers: NATIVE, ...opts }) }
  jwks.resetJwksCacheForTests()
  const fetchOk = globalThis.fetch
  globalThis.fetch = async (url, init) => { if (String(url).includes('/auth/keys') || String(url).includes('/oauth2/v3/certs')) throw new Error('red caída'); return fetchOk(url, init) }
  eq((await appleCall(appleToken('s9', nonce))).res.status, 503, 'JWKS de Apple caído = 503')
  eq((await gCall(googleToken('g-owner', 'owner@example.test'))).res.status, 503, 'JWKS de Google caído = 503')
  globalThis.fetch = fetchOk
  jwks.resetJwksCacheForTests()

  // ── Apple ──────────────────────────────────────────────────────────────────
  eq((await call(apple, { body: { identityToken: appleToken('s0', nonce), nonce } })).res.status, 400, 'Apple exige cliente nativo')
  eq((await appleCall(appleToken('s0', nonce, { email: 'nadie@example.test', email_verified: 'true' }))).res.status, 403, 'sin cuenta/tienda = 403')
  eq((await appleCall(appleToken('s0', nonce, { email: 'nadie@example.test', email_verified: 'true' }))).data.message, 'No hay una tienda vinculada a esta cuenta', 'mensaje de sin tienda')
  ok((await prisma.appleIdentity.count()) === 0 && (await prisma.account.count()) === 1, 'un rechazo no crea cuentas ni identidades')
  eq((await appleCall(appleToken('s1', nonce), {}, {})).res.status, 403, 'sin correo y sin vínculo = 403')
  eq((await appleCall(appleToken('s1', 'cd'.repeat(32)))).res.status, 401, 'nonce que no coincide = 401')
  eq((await appleCall(appleToken('s1', nonce, { aud: 'otra.app' }))).res.status, 401, 'aud ajeno = 401')
  eq((await appleCall(appleToken('s1', nonce, { iss: 'https://evil.example' }))).res.status, 401, 'iss ajeno = 401')
  eq((await appleCall(appleToken('s1', nonce, { exp: now() - 10 }))).res.status, 401, 'token vencido = 401')
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  eq((await appleCall(rsaJwt({ iss: 'https://appleid.apple.com', aud: 'online.moboss.app', sub: 's1', exp: now() + 99, nonce: createHash('sha256').update(nonce).digest('hex') }, 'kid-1', other))).res.status, 401, 'firma inválida = 401')
  eq((await appleCall(appleToken('s1', nonce).replace(/^[^.]+/, Buffer.from(JSON.stringify({ alg: 'none', kid: 'kid-1' })).toString('base64url')))).res.status, 401, 'alg distinto de RS256 = 401')
  eq((await appleCall('basura')).res.status, 401, 'token mal formado = 401')

  // Correo real verificado de una tienda con correo verificado: vincula.
  const ap1 = await appleCall(appleToken('apple-owner-a', nonce, { email: 'dueno-a@example.test', email_verified: 'true' }), { fullName: { givenName: 'Ana', familyName: 'Pérez' }, authorizationCode: 'code-123' })
  ok(ap1.res.status === 200 && /^[a-f0-9]{64}$/.test(ap1.data.token) && ap1.data.tenant.id === A.tenant.id && ap1.data.sellers.length === 1 && ap1.data.scope === 'device:company', 'Apple con correo verificado entra a la tienda existente')
  const identity = await prisma.appleIdentity.findUnique({ where: { subject: 'apple-owner-a' } })
  ok(identity.accountId === account.id && identity.name === 'Ana Pérez' && identity.refreshTokenEnc && !identity.refreshTokenEnc.includes('apple-refresh-secret'), 'identidad vinculada; nombre guardado; refresh token cifrado')
  ok(appleCalls[0].form.code === 'code-123' && appleCalls[0].form.client_id === 'online.moboss.app' && appleCalls[0].form.client_secret.split('.').length === 3, 'canje del código con client_secret ES256')
  const apPin = await call(pin, { body: { sellerId: A.admin.id, pin: '4821' }, headers: NATIVE, bearer: ap1.data.token })
  ok(apPin.res.status === 200 && apPin.data.sellerToken, 'la sesión de Apple sigue al PIN')
  // Segundo ingreso: ya vinculada, sin correo (relay) funciona por sub.
  const ap2 = await appleCall(appleToken('apple-owner-a', nonce, { email: 'abc123@privaterelay.appleid.com', is_private_email: 'true', email_verified: 'true' }))
  ok(ap2.res.status === 200 && ap2.data.tenant.id === A.tenant.id, 'relay privado funciona una vez vinculada')
  ok((await prisma.appleIdentity.findUnique({ where: { subject: 'apple-owner-a' } })).isPrivateRelay === true, 'se registra el relay')
  // Relay desconocido: 403 sin sesión; con sesión abierta se vincula.
  const relayToken = appleToken('apple-relay-new', nonce, { email: 'zzz999@privaterelay.appleid.com', is_private_email: true, email_verified: true })
  eq((await appleCall(relayToken)).res.status, 403, 'relay nuevo sin vínculo = 403')
  eq((await appleCall(relayToken, { reauth: { pin: '4821' } }, { bearer: 'f'.repeat(64) })).res.status, 401, 'vincular con sesión inválida = 401')
  eq((await appleCall(relayToken, {}, { bearer: sellerToken })).res.status, 400, 'vincular con sesión abierta SIN reautenticación = 400')
  eq((await appleCall(relayToken, { reauth: { pin: '0000' } }, { bearer: sellerToken })).res.status, 401, 'vincular con PIN incorrecto = 401')
  eq((await appleCall(relayToken, { reauth: { apple: { identityToken: relayToken, nonce } } }, { bearer: sellerToken })).res.status, 400, 'vincular no acepta Apple/Google como reautenticación')
  ok((await prisma.appleIdentity.count({ where: { subject: 'apple-relay-new' } })) === 0, 'sin reautenticación válida no se crea la identidad')
  const linked = await appleCall(relayToken, { reauth: { pin: '4821' } }, { bearer: sellerToken })
  ok(linked.res.status === 200 && (await prisma.appleIdentity.findUnique({ where: { subject: 'apple-relay-new' } }))?.accountId === account.id, 'relay se vincula desde una sesión abierta (con PIN fresco)')
  const linkAudit = await prisma.auditLog.findMany({ where: { action: 'APPLE_LINKED', entityId: account.id } })
  ok(linkAudit.length >= 2 && linkAudit.some(r => r.userId === A.admin.id && r.metadata?.via === 'session'), 'la vinculación deja APPLE_LINKED en la auditoría (por sesión y por correo verificado)')
  // Correo de una tienda NO verificada no vincula.
  const U = await mkStore('u', 'sin-verificar@example.test')
  await prisma.tenant.update({ where: { id: U.tenant.id }, data: { emailVerifiedAt: null } })
  await call(login, { body: { email: 'sin-verificar@example.test', password: 'Tienda-Segura-123', deviceId: 'd' }, headers: NATIVE })
  eq((await appleCall(appleToken('apple-unverified', nonce, { email: 'sin-verificar@example.test', email_verified: 'true' }))).res.status, 403, 'tienda con correo sin verificar no se vincula por correo')
  // Dos tiendas: pide elegir.
  const B = await mkStore('b', 'dueno-b@example.test')
  await prisma.tenantMembership.create({ data: { accountId: account.id, tenantId: B.tenant.id, userId: B.admin.id, role: 'OWNER' } })
  const pick = await appleCall(appleToken('apple-owner-a', nonce))
  ok(pick.res.status === 200 && pick.data.storeRequired === true && pick.data.stores.length === 2 && !pick.data.token, 'varias tiendas: primero se elige')
  const picked = await appleCall(appleToken('apple-owner-a', nonce), { storeId: B.tenant.id })
  ok(picked.data.tenant.id === B.tenant.id && picked.data.token, 'con storeId entra a esa tienda')
  eq((await appleCall(appleToken('apple-owner-a', nonce), { storeId: 'no-existe' })).res.status, 403, 'tienda ajena = 403')
  await prisma.tenantMembership.updateMany({ where: { accountId: account.id, tenantId: B.tenant.id }, data: { revokedAt: new Date() } })
  await prisma.tenantMembership.updateMany({ where: { accountId: account.id, tenantId: A.tenant.id }, data: { revokedAt: new Date() } })
  eq((await appleCall(appleToken('apple-owner-a', nonce))).res.status, 403, 'pertenencias revocadas = 403')
  await prisma.tenantMembership.updateMany({ where: { accountId: account.id, tenantId: A.tenant.id }, data: { revokedAt: null } })
  const savedApple = process.env.MOBOS_APPLE_CLIENT_IDS
  delete process.env.MOBOS_APPLE_CLIENT_IDS
  eq((await appleCall(appleToken('apple-owner-a', nonce))).res.status, 503, 'sin configuración = 503')
  process.env.MOBOS_APPLE_CLIENT_IDS = savedApple
  // Límite de intentos antes de la base: la 21.ª desde la misma IP es 429.
  let last
  for (let i = 0; i < 21; i += 1) last = await appleCall('basura', {}, { ip: '203.0.113.9' })
  eq(last.res.status, 429, 'rate limit en /auth/apple')
  ok(last.res.headers.get('retry-after'), 'con Retry-After')

  // ── Google nativo ──────────────────────────────────────────────────────────
  eq((await call(googleNative, { body: { idToken: googleToken('g1', 'g1@example.test') } })).res.status, 400, 'Google nativo exige cliente nativo')
  const gStranger = await gCall(googleToken('g-stranger', 'stranger@example.test'))
  ok(gStranger.res.status === 403 && gStranger.data.message === 'No hay una tienda vinculada a esta cuenta', 'Google sin tienda = 403')
  ok(!(await prisma.account.findUnique({ where: { googleSubject: 'g-stranger' } })) && !(await prisma.googleIdentity.findUnique({ where: { subject: 'g-stranger' } })), 'el rechazo no crea cuenta ni identidad')
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { aud: 'test-client', azp: 'test-client' }))).res.status, 401, 'aud del cliente web = 401 (solo el de iOS)')
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { email_verified: false }))).res.status, 401, 'correo sin verificar = 401')
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { iss: 'https://evil.example' }))).res.status, 401, 'iss ajeno = 401')
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { exp: now() - 5 }))).res.status, 401, 'vencido = 401')
  eq((await gCall(rsaJwt({ iss: 'https://accounts.google.com', aud: GOOGLE_IOS, sub: 'g-owner', email: 'owner@example.test', email_verified: true, exp: now() + 90 }, 'kid-1', other))).res.status, 401, 'firma inválida = 401')
  await prisma.googleIdentity.create({ data: { subject: 'g-owner', email: 'owner@example.test', name: 'Dueña' } })
  await prisma.googleStoreAccess.create({ data: { subject: 'g-owner', tenantId: B.tenant.id, owner: true } })
  const gOk = await gCall(googleToken('g-owner', 'owner@example.test'))
  ok(gOk.res.status === 200 && /^[a-f0-9]{64}$/.test(gOk.data.token) && gOk.data.tenant.id === B.tenant.id && gOk.data.sellers.length === 1, 'Google nativo entra a su tienda existente')
  // Nonce de Google: el claim tiene que coincidir con el emitido y se consume una vez.
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { nonce: 'aa'.repeat(32) }))).res.status, 401, 'Google: claim nonce distinto = 401')
  eq((await gCall(googleToken('g-owner', 'owner@example.test', { nonce: undefined }))).res.status, 401, 'Google: idToken sin nonce = 401')
  eq((await call(googleNative, { body: { idToken: googleToken('g-owner', 'owner@example.test') }, headers: NATIVE })).res.status, 400, 'Google: sin nonce en el cuerpo = 400')
  await seedNonce(GN)
  const gTok = googleToken('g-owner', 'owner@example.test')
  eq((await call(googleNative, { body: { idToken: gTok, nonce: GN }, headers: NATIVE })).res.status, 200, 'Google con nonce válido')
  eq((await call(googleNative, { body: { idToken: gTok, nonce: GN }, headers: NATIVE })).res.status, 401, 'Google: replay del mismo idToken = 401')
  const gPin = await call(pin, { body: { sellerId: B.admin.id, pin: '4821' }, headers: NATIVE, bearer: gOk.data.token })
  ok(gPin.res.status === 200 && gPin.data.sellerToken, 'la sesión de Google sigue al PIN')
  const savedGoogle = process.env.MOBOS_GOOGLE_IOS_CLIENT_ID
  delete process.env.MOBOS_GOOGLE_IOS_CLIENT_ID
  eq((await gCall(googleToken('g-owner', 'owner@example.test'))).res.status, 503, 'Google sin configuración = 503')
  process.env.MOBOS_GOOGLE_IOS_CLIENT_ID = savedGoogle
  for (let i = 0; i < 21; i += 1) last = await gCall('basura', {}, { ip: '203.0.113.10' })
  eq(last.res.status, 429, 'rate limit en /auth/google/native')

  // ── Borrar mi cuenta (Bearer + reautenticación Apple/Google) ───────────────
  const mkMember = async (name, pinCode, accountData) => {
    const user = await prisma.user.create({ data: { tenantId: A.tenant.id, name, email: `${name}@example.test`, pinHash: await bcrypt.hash(pinCode, 4), pinLength: 4, role: 'VENDEDOR' } })
    const acc = await prisma.account.create({ data: accountData })
    await prisma.tenantMembership.create({ data: { accountId: acc.id, tenantId: A.tenant.id, userId: user.id, role: 'MEMBER' } })
    return { user, acc }
  }
  const member = await mkMember('vendedora-apple', '5932', {})
  await prisma.appleIdentity.create({ data: { subject: 'apple-member', accountId: member.acc.id, email: 'rel@privaterelay.appleid.com', isPrivateRelay: true } })
  const mLogin = await appleCall(appleToken('apple-member', nonce), { authorizationCode: 'code-member' })
  ok(mLogin.res.status === 200, 'la vendedora entra con Apple')
  const mSeller = (await call(pin, { body: { sellerId: member.user.id, pin: '5932' }, headers: NATIVE, bearer: mLogin.data.token })).data.sellerToken
  await call(devices.POST, { body: { token: 'c'.repeat(64) }, bearer: mSeller })
  eq((await call(deleteMe, { method: 'DELETE', body: {}, bearer: mSeller })).res.status, 400, 'borrar sin reautenticación = 400')
  await seedNonce(AR, 'reauth')
  eq((await call(deleteMe, { method: 'DELETE', body: { apple: { identityToken: appleToken('apple-ajena', AR), nonce: AR } }, bearer: mSeller })).res.status, 401, 'identidad de Apple ajena = 401')
  await seedNonce(GR, 'reauth')
  eq((await call(deleteMe, { method: 'DELETE', body: { googleIdToken: googleToken('g-otra', 'otra@example.test', { nonce: GR }), googleNonce: GR }, bearer: mSeller })).res.status, 401, 'Google no vinculada = 401')
  appleCalls.length = 0
  // El nonce de login NO sirve para reautenticar (propósito distinto) y un nonce consumido no se reutiliza.
  await seedNonce(AR, 'login')
  eq((await call(deleteMe, { method: 'DELETE', body: { apple: { identityToken: appleToken('apple-member', AR), nonce: AR } }, bearer: mSeller })).res.status, 401, 'borrado: nonce de login no sirve como reauth')
  eq((await call(deleteMe, { method: 'DELETE', body: { apple: { identityToken: appleToken('apple-member', nonce), nonce } }, bearer: mSeller })).res.status, 401, 'borrado: nonce no emitido = 401')
  // Una identidad de Apple ya vinculada a OTRA cuenta no se puede mover con una sesión abierta.
  eq((await appleCall(appleToken('apple-member', nonce), { reauth: { pin: '4821' } }, { bearer: sellerToken })).res.status, 409, 'vincular una identidad de otra cuenta = 409')
  await seedNonce(AR, 'reauth')
  const gone = await call(deleteMe, { method: 'DELETE', body: { apple: { identityToken: appleToken('apple-member', AR), nonce: AR } }, bearer: mSeller })
  ok(gone.res.status === 200 && gone.data.ok === true, 'DELETE /api/me con Bearer y reautenticación Apple')
  const revoke = appleCalls.find(c => c.url.endsWith('/auth/revoke'))
  ok(revoke && revoke.form.token === 'apple-refresh-secret' && revoke.form.token_type_hint === 'refresh_token', 'se revoca el refresh token de Apple')
  ok(!(await prisma.appleIdentity.findUnique({ where: { subject: 'apple-member' } })) && (await prisma.deviceToken.count({ where: { userId: member.user.id } })) === 0 && (await prisma.user.findUnique({ where: { id: member.user.id } })).name === 'Usuario eliminado', 'identidad, tokens APNs y datos personales se eliminan')
  eq((await call(devices.POST, { body: { token: 'c'.repeat(64) }, bearer: mSeller })).res.status, 401, 'la sesión borrada ya no sirve')
  // Google como reautenticación.
  const gMember = await mkMember('vendedor-google', '6043', { googleSubject: 'g-member' })
  await prisma.googleIdentity.create({ data: { subject: 'g-member', email: 'gm@example.test' } })
  await prisma.googleStoreAccess.create({ data: { subject: 'g-member', tenantId: A.tenant.id, owner: false } })
  const gmLogin = await gCall(googleToken('g-member', 'gm@example.test'))
  const gmSeller = (await call(pin, { body: { sellerId: gMember.user.id, pin: '6043' }, headers: NATIVE, bearer: gmLogin.data.token })).data.sellerToken
  await seedNonce(GR, 'reauth')
  eq((await call(deleteMe, { method: 'DELETE', body: { googleIdToken: googleToken('g-member', 'gm@example.test', { nonce: GR }), googleNonce: GR }, bearer: gmSeller })).res.status, 200, 'DELETE /api/me con reautenticación Google')
  // ── Cifrado de secretos: aviso en el chequeo del sistema y refresh token sin sellar ──
  const encKeys = process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON
  const getCheck = async () => (await (await checks_(new Request('https://api.example.test/api/system/checks', { headers: { Authorization: `Bearer ${sellerToken}` } }))).json()).checks.find(c => c.id === 'secretos-cifrado')
  eq((await getCheck()).estado, 'ok', 'chequeo del sistema: cifrado de secretos activo')
  delete process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON
  const missing = await getCheck()
  ok(missing.estado === 'atencion' && /Cifrado de secretos no configurado/.test(missing.detalle) && /MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON/.test(missing.detalle), 'chequeo del sistema: «Cifrado de secretos no configurado»')
  eq(appleLib.sealAppleRefreshToken('s', 'tok'), null, 'sin cifrado el refresh token no se guarda')
  process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON = encKeys

  // El dueño sigue bloqueado.
  eq((await call(deleteMe, { method: 'DELETE', body: { pin: '4821' }, bearer: sellerToken })).res.status, 409, 'el dueño sigue necesitando transferir o eliminar la tienda')

  console.log(`iOS backend: ${checks} checks OK (rutas reales, PostgreSQL desechable; Apple/Google/APNs simulados).`)
} finally {
  globalThis.fetch = originalFetch
  if (prisma) await prisma.$disconnect()
  if (started) run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
}
