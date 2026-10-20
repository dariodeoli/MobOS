import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createServer as netServer } from 'node:net'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = mkdtempSync(join(tmpdir(), 'mobos-mcp-browser-'))
const pgdata = join(root, 'pgdata'), pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const freePort = () => new Promise(resolve => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const run = (bin, args) => execFileSync(join(pgBin, bin), args, { stdio: ['ignore', 'pipe', 'pipe'] })
const apiPort = await freePort(), appPort = await freePort(), callbackPort = await freePort(), pgPort = await freePort()
const dbUrl = `postgresql://postgres@127.0.0.1:${pgPort}/mobos_mcp_browser`
let pgStarted = false, apiServer, appServer, callbackServer, browser, callback = ''
const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const backend = join(repo, 'backend')
const saved = { ...process.env }
const clientId = 'browser-fixture', redirectUri = `https://127.0.0.1:${callbackPort}/callback`
const verifier = 'v'.repeat(43), challenge = createHash('sha256').update(verifier).digest('base64url')
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${pgPort} -k ${root}`, '-w', 'start']); pgStarted = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', 'mobos_mcp_browser'])
  const apiOrigin = `http://localhost:${apiPort}`, resourceOrigin = 'https://api.example.test', appOrigin = `http://127.0.0.1:${appPort}`
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: appOrigin, MOBOS_MCP_RESOURCE: resourceOrigin, MOBOS_MCP_ISSUER: apiOrigin, MOBOS_MCP_CLIENTS_JSON: JSON.stringify([{ clientId, name: 'Browser fixture', redirectUris: [redirectUri] }]) })
  execFileSync(join(backend, 'node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', join(backend, 'prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: dbUrl }, cwd: backend, stdio: 'ignore' })
  require.extensions['.ts'] = (m, p) => { const ts = require('/private/tmp/mobos-mcp-608-integration-qa/backend/node_modules/typescript'); m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p) }
  const { PrismaClient } = require(join(backend, 'node_modules/@prisma/client')), { PrismaPg } = require(join(backend, 'node_modules/@prisma/adapter-pg'))
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })
  const auth = require(join(backend, 'lib/auth.ts'))
  const oauth = require(join(backend, 'lib/mcp/oauth.ts'))
  const tenant = await db.tenant.create({ data: { name: 'Browser fixture', slug: 'browser-fixture', email: 'browser@example.test' } })
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Centro' } })
  const user = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Browser Admin', email: 'admin@example.test', pinHash: 'unused', role: 'ADMIN' } })
  const token = 'browser-session-token'
  await db.session.create({ data: { tenantId: tenant.id, userId: user.id, level: 'SELLER', deviceId: 'browser-fixture', tokenHash: auth.hashToken(token), expiresAt: new Date(Date.now() + 3600000) } })
  const { GET: authorizeGet, POST: authorizePost } = require(join(backend, 'app/api/mcp/authorize/route.ts'))
  const { POST: tokenPost } = require(join(backend, 'app/api/mcp/token/route.ts'))
  const dispatch = async (req, res) => {
    try {
      const body = []; for await (const chunk of req) body.push(chunk)
      const full = `${apiOrigin}${req.url}`; if (req.method === 'POST') console.log('POST origin', req.headers.origin, req.headers.cookie)
      const request = new Request(full, { method: req.method, headers: req.headers, body: body.length ? Buffer.concat(body) : undefined })
      const response = req.url.startsWith('/api/mcp/authorize') ? (req.method === 'GET' ? await authorizeGet(request) : await authorizePost(request)) : await tokenPost(request)
      if (req.method === 'POST' && response.headers.get('location')) callback = response.headers.get('location'); console.log('API response', req.method, req.url, response.status, response.headers.get('location')); res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) { res.statusCode = 500; res.end(String(error?.stack || error)) }
  }
  apiServer = createServer(dispatch); await new Promise(resolve => apiServer.listen(apiPort, '127.0.0.1', resolve)); callbackServer = createServer((req, res) => { console.log('CALLBACK HIT', req.url); callback = req.url; res.statusCode = 200; res.end('<title>callback</title>') }); await new Promise(resolve => callbackServer.listen(callbackPort, '127.0.0.1', resolve))
  appServer = createServer((req, res) => { const u = new URL(req.url, appOrigin); if (u.pathname === '/login' && u.searchParams.get('returnTo')) { const back = new URL(u.searchParams.get('returnTo'), appOrigin); const req = back.searchParams.get('request'); res.statusCode = 302; res.setHeader('location', apiOrigin + req); return res.end() } res.statusCode = 200; res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>MobOS app</title>') }); await new Promise(resolve => appServer.listen(appPort, '127.0.0.1', resolve))
  const initialRequest = `/api/mcp/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, resource: resourceOrigin, scope: 'products:read', code_challenge: challenge, code_challenge_method: 'S256', state: 'bridge-state' })}`
  const unauthenticated = await fetch(`${apiOrigin}${initialRequest}`, { redirect: 'manual' })
  assert.equal(unauthenticated.status, 303)
  const bridgeLocation = unauthenticated.headers.get('location')
  assert.ok(bridgeLocation?.startsWith(`${appOrigin}/mcp/autorizar?`), 'unauthenticated OAuth must continue through the app bridge')
  const bridge = await fetch(`${appOrigin}/login?returnTo=${encodeURIComponent(bridgeLocation)}`, { redirect: 'manual' })
  assert.equal(bridge.status, 302)
  assert.equal(bridge.headers.get('location'), `${apiOrigin}${initialRequest}`)
  const evilOrigin = await fetch(`${apiOrigin}/api/mcp/authorize`, { method: 'POST', headers: { origin: 'https://evil.example', cookie: 'mobos_seller_session=browser-session-token', 'content-type': 'application/x-www-form-urlencoded' }, body: 'decision=approve' })
  assert.equal(evilOrigin.status, 401, 'foreign Origin must be rejected')
  browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] }); const page = await browser.newPage({ ignoreHTTPSErrors: true })
  await page.context().addCookies([{ name: 'mobos_seller_session', value: token, url: apiOrigin }])
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, resource: resourceOrigin, scope: 'products:read', code_challenge: challenge, code_challenge_method: 'S256', state: 'browser-state' })
  await page.context().route('**/*', async route => { if (route.request().url().startsWith(`https://127.0.0.1:${callbackPort}/callback`)) { callback = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>callback</title>' }) } return route.continue() })
  await page.goto(`${apiOrigin}/api/mcp/authorize?${params}`, { waitUntil: 'domcontentloaded' })
  console.log('consent', page.url(), await page.title(), await page.locator('body').innerText()); assert.match(await page.locator('body').innerText(), /Autorizar conexión/)
  await page.getByRole('button', { name: 'Autorizar' }).click()
  await page.waitForLoadState('domcontentloaded')
  console.log('after', page.url(), 'callback', callback); assert.match(callback, /code=/); assert.match(callback, /state=browser-state/)
  const callbackUrl = new URL(callback)
  const tokenResponse = await fetch(`${apiOrigin}/api/mcp/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: callbackUrl.searchParams.get('code'), redirect_uri: redirectUri, resource: resourceOrigin, code_verifier: verifier }) })
  const tokenJson = await tokenResponse.json(); assert.equal(tokenResponse.status, 200); assert.equal(tokenJson.token_type, 'Bearer')
  console.log('MCP OAuth browser + PostgreSQL: PASS (GET consent, approve, callback, PKCE token)')
  await db.$disconnect()
} finally {
  await browser?.close().catch(() => {}); await new Promise(resolve => apiServer?.close(() => resolve()) || resolve()); await new Promise(resolve => appServer?.close(() => resolve()) || resolve()); await new Promise(resolve => callbackServer?.close(() => resolve()) || resolve()); if (pgStarted) run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop']); rmSync(root, { recursive: true, force: true }); Object.assign(process.env, saved)
}
