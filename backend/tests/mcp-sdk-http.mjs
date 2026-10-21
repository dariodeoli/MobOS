import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = mkdtempSync(join(tmpdir(), 'mobos-mcp-sdk-http-'))
const pgdata = join(root, 'pgdata')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const backend = dirname(fileURLToPath(import.meta.url)) + '/..'
const saved = { ...process.env }
const clients = []
let pgStarted = false
let httpServer
let checks = 0
const ok = (value, label) => { assert.ok(value, label); checks++ }
const command = (bin, args) => execFileSync(join(pgBin, bin), args, { stdio: ['ignore', 'pipe', 'pipe'] })
const freePort = () => new Promise(resolve => { const server = createNetServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) }) })

try {
  const port = await freePort()
  const dbUrl = `postgresql://postgres@127.0.0.1:${port}/mcp_sdk_http_test`
  command('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  command('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); pgStarted = true
  command('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'mcp_sdk_http_test'])
  const httpPort = await freePort()
  const resource = `http://localhost:${httpPort}`
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_MCP_RESOURCE: resource, MOBOS_MCP_ISSUER: resource, MOBOS_MCP_ALLOWED_ORIGINS: resource })
  execFileSync(backend + '/node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', backend + '/prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: dbUrl }, cwd: backend, stdio: 'inherit' })
  require.extensions['.ts'] = (module, filename) => {
    const ts = require('typescript')
    module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  }
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const oauth = require('../lib/mcp/oauth.ts')
  const { issueMcpTokens, mcpResource } = oauth
  const makeDb = () => { const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) }); clients.push(db); return db }
  const db = makeDb()
  const tenant = await db.tenant.create({ data: { name: 'SDK HTTP', slug: 'sdk-http', email: 'sdk@example.test' } })
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Centro' } })
  const account = await db.account.create({ data: { email: 'sdk-account@example.test' } })
  const user = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'SDK Admin', email: 'sdk-user@example.test', pinHash: 'unused', role: 'ADMIN' } })
  await db.tenantMembership.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, role: 'OWNER' } })
  const session = await db.session.create({ data: { tenantId: tenant.id, accountId: account.id, userId: user.id, level: 'COMPANY', deviceId: 'sdk-http', tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600000) } })
  const grant = await db.mcpClientGrant.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes: ['prices:write'] } })
  const issued = await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['prices:write'] })
  const product = await db.product.create({ data: { tenantId: tenant.id, branchId: branch.id, sku: 'SDK-PRICE-1', name: 'SDK price', pricePyg: 1000, stock: 1 } })

  const { POST } = require('../app/api/mcp/streamable/route.ts')
  httpServer = createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const request = new Request(`${resource}/api/mcp/streamable`, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
      const response = await POST(request)
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) { res.statusCode = 500; res.end(String(error?.stack || error)) }
  })
  await new Promise(resolve => httpServer.listen(httpPort, '127.0.0.1', resolve))

  const { Client } = await import('@modelcontextprotocol/sdk/client')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const transport = new StreamableHTTPClientTransport(new URL(`${resource}/api/mcp/streamable`), { requestInit: { headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, accept: 'application/json, text/event-stream' } } })
  const client = new Client({ name: 'mobos-sdk-http-test', version: '1.0.0' })
  await client.connect(transport); ok(Boolean(client.getServerVersion()), 'initialize via StreamableHTTPClientTransport')
  const listed = await client.listTools(); ok(listed.tools.some(tool => tool.name === 'prices.write'), 'tools/list via SDK')
  await client.notification({ method: 'notifications/initialized' }); ok(true, 'notification via SDK')
  const preview = await client.callTool({ name: 'prices.write', arguments: { mode: 'preview', productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!preview.isError && JSON.stringify(preview).includes('previewId'), 'prices.write preview via SDK')
  const previewText = preview.content.find(item => item.type === 'text')?.text || ''
  const previewPayload = JSON.parse(previewText)
  const committed = await client.callTool({ name: 'prices.write', arguments: { mode: 'commit', previewId: previewPayload.previewId, productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!committed.isError && committed.structuredContent?.committed === true, 'prices.write commit via SDK')
  const repeat = await client.callTool({ name: 'prices.write', arguments: { mode: 'commit', previewId: previewPayload.previewId, productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!repeat.isError && repeat.structuredContent?.committed === true && repeat.structuredContent?.previewId === committed.structuredContent?.previewId, 'prices.write idempotent commit via SDK')
  let invalid = false; try { await client.callTool({ name: 'prices.write', arguments: { mode: 'preview', idempotencyKey: 'sdk-http-bad' } }) } catch { invalid = true }; ok(invalid, 'invalid arguments return MCP protocol error')
  await client.close()

  const raw = async (headers, body = '{}') => fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, ...headers }, body })
  const badOrigin = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }); ok(badOrigin.status === 403, 'invalid Origin rejected')
  const badMedia = await raw({ 'content-type': 'text/plain' }); ok(badMedia.status === 415, 'unsupported media type rejected')
  console.log(`MCP SDK HTTP 1.32.1: ${checks} PASS (HTTP aislado; initialize/list/call/notification/Origin/media type)`)
} finally {
  if (httpServer) await new Promise(resolve => httpServer.close(resolve))
  await Promise.all(clients.map(db => db.$disconnect().catch(() => {})))
  if (pgStarted) command('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
}
