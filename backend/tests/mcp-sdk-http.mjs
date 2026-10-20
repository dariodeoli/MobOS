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
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_MCP_RESOURCE: resource, MOBOS_MCP_ISSUER: resource, MOBOS_MCP_ALLOWED_ORIGINS: resource, MOBOS_MCP_CLIENTS_JSON: JSON.stringify([{ clientId: 'sdk-http', name: 'SDK HTTP', redirectUris: ['https://connector.example/callback'] }]) })
  execFileSync(backend + '/node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', backend + '/prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: dbUrl }, cwd: backend, stdio: 'inherit' })
  require.extensions['.ts'] = (module, filename) => {
    const ts = require('typescript')
    module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  }
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const oauth = require('../lib/mcp/oauth.ts')
  const { issueMcpAuthorizationCode, issueMcpTokens, mcpResource, pkceChallenge, requireMcpAccessToken } = oauth
  const makeDb = () => { const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) }); clients.push(db); return db }
  const db = makeDb()
  const tenant = await db.tenant.create({ data: { name: 'SDK HTTP', slug: 'sdk-http', email: 'sdk@example.test' } })
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Centro' } })
  const account = await db.account.create({ data: { email: 'sdk-account@example.test' } })
  const user = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'SDK Admin', email: 'sdk-user@example.test', pinHash: 'unused', role: 'ADMIN' } })
  await db.tenantMembership.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, role: 'OWNER' } })
  const session = await db.session.create({ data: { tenantId: tenant.id, accountId: account.id, userId: user.id, level: 'COMPANY', deviceId: 'sdk-http', tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600000) } })
  const scopes = ['prices:write', 'product_images:write', 'products:read', 'customers:read', 'customers:write', 'sales:read', 'reports:read']
  const grant = await db.mcpClientGrant.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes } })
  const issued = await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource: mcpResource(), scopes })
  const product = await db.product.create({ data: { tenantId: tenant.id, branchId: branch.id, sku: 'SDK-PRICE-1', name: 'SDK price', pricePyg: 1000, stock: 1 } })
  await db.product.createMany({ data: [1, 2, 3].map(n => ({ tenantId: tenant.id, branchId: branch.id, sku: `SDK-LIST-${n}`, name: `SDK list ${n}`, pricePyg: 1000 + n, stock: n })) })
  await db.customer.createMany({ data: [1, 2, 3].map(n => ({ tenantId: tenant.id, name: `SDK customer ${n}`, document: `CU-${n}` })) })
  const reportDate = new Date().toISOString().slice(0, 10)
  const reportAt = new Date(`${reportDate}T12:00:00.000Z`)
  const reportCustomer = await db.customer.create({ data: { tenantId: tenant.id, name: 'SDK report customer', document: 'CU-REPORT' } })
  const reportOrder = await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, customerId: reportCustomer.id, sellerId: user.id, orderNumber: 'SDK-REPORT-1', status: 'COMPLETED', subtotalPyg: 1000, totalPyg: 1000, createdAt: reportAt, items: { create: [{ description: 'Known cost', quantity: 1, unitPricePyg: 1000, totalPyg: 1000, unitCostPyg: 600 }] } } })
  const originalPayment = await db.payment.create({ data: { tenantId: tenant.id, orderId: reportOrder.id, createdById: user.id, method: 'CASH', status: 'CONFIRMED', amountPyg: 1000, accountSnapshot: { id: 'cash', name: 'Caja', processor: 'cash' }, createdAt: reportAt } })
  await db.payment.create({ data: { tenantId: tenant.id, orderId: reportOrder.id, createdById: user.id, method: 'CASH', status: 'CONFIRMED', amountPyg: -1000, reversalOfId: originalPayment.id, createdAt: reportAt } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'SDK-REPORT-CANCELLED', status: 'CANCELLED', subtotalPyg: 2000, totalPyg: 2000, createdAt: reportAt } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'SDK-REPORT-UNKNOWN', status: 'COMPLETED', subtotalPyg: 500, totalPyg: 500, createdAt: reportAt, items: { create: [{ description: 'Unknown cost', quantity: 1, unitPricePyg: 500, totalPyg: 500 }] } } })

  const { POST } = require('../app/api/mcp/streamable/route.ts')
  const { POST: tokenPost } = require('../app/api/mcp/token/route.ts')
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
  ok(listed.tools.some(tool => tool.name === 'product_images.write'), 'product_images.write advertised via SDK')
  const productPage = await client.callTool({ name: 'products.read', arguments: { limit: 2 } }); ok(!productPage.isError && Array.isArray(productPage.structuredContent?.items) && productPage.structuredContent.items.length === 2 && productPage.structuredContent.nextCursor, 'products.read first cursor page')
  const productPage2 = await client.callTool({ name: 'products.read', arguments: { limit: 2, cursor: productPage.structuredContent.nextCursor } }); ok(!productPage2.isError && productPage2.structuredContent.items.length > 0 && !productPage2.structuredContent.items.some(row => productPage.structuredContent.items.some(prev => prev.id === row.id)), 'products.read cursor has no duplicates')
  const customerPage = await client.callTool({ name: 'customers.read', arguments: { limit: 2 } }); ok(!customerPage.isError && customerPage.structuredContent.items.length === 2 && customerPage.structuredContent.nextCursor, 'customers.read first cursor page')
  const salesPage = await client.callTool({ name: 'sales.read', arguments: { limit: 2 } }); ok(!salesPage.isError && salesPage.structuredContent.items.length === 2 && salesPage.structuredContent.nextCursor, 'sales.read first cursor page')
  const salesPage2 = await client.callTool({ name: 'sales.read', arguments: { limit: 2, cursor: salesPage.structuredContent.nextCursor } }); ok(!salesPage2.isError && salesPage2.structuredContent.items.length > 0 && !salesPage2.structuredContent.items.some(row => salesPage.structuredContent.items.some(prev => prev.id === row.id)), 'sales.read cursor has no duplicates')
  const report = await client.callTool({ name: 'reports.read', arguments: { from: reportDate, to: reportDate, groupBy: 'product', tzOffset: 0 } }); ok(!report.isError && report.structuredContent.totals && report.structuredContent.totals.orders === 2 && report.structuredContent.totals.linesWithoutCost === 1, 'reports.read period/cancelled/unknown-cost rules')
  const paymentReport = await client.callTool({ name: 'reports.read', arguments: { from: reportDate, to: reportDate, groupBy: 'payments', paymentsBy: 'account', tzOffset: 0 } }); const reportGroups = paymentReport.structuredContent.groups || []; ok(reportGroups.some(group => group.key === 'cash'), 'reports.read payment account snapshot grouping')
  const badCursor = await client.callTool({ name: 'products.read', arguments: { cursor: 'invalid' } }).then(() => false).catch(() => true); ok(badCursor, 'invalid cursor rejected')
  ok(listed.tools.some(tool => tool.name === 'customers.write'), 'customers.write advertised via SDK')
  const customerArgs = { mode: 'preview', operation: 'create', name: 'MCP customer', document: 'MCP-CUSTOMER-1', phone: '+595991000001', email: 'mcp-customer@example.test', idempotencyKey: 'sdk-http-customer-1' }
  const customerPreview = await client.callTool({ name: 'customers.write', arguments: customerArgs }); ok(!customerPreview.isError, 'customer create preview via SDK')
  const customerPreviewPayload = JSON.parse(customerPreview.content.find(item => item.type === 'text')?.text || '{}')
  const customerCommit = await client.callTool({ name: 'customers.write', arguments: { ...customerArgs, mode: 'commit', previewId: customerPreviewPayload.previewId } }); ok(!customerCommit.isError && customerCommit.structuredContent?.committed === true, 'customer create commit via SDK')
  const customerRepeat = await client.callTool({ name: 'customers.write', arguments: { ...customerArgs, mode: 'commit', previewId: customerPreviewPayload.previewId } }); ok(!customerRepeat.isError && customerRepeat.structuredContent?.idempotent === true, 'customer create replay idempotent')
  const customerId = customerCommit.structuredContent.entityId
  const updateArgs = { mode: 'preview', operation: 'update', customerId, phone: '+595991000002', idempotencyKey: 'sdk-http-customer-2' }
  const updatePreview = await client.callTool({ name: 'customers.write', arguments: updateArgs }); const updatePreviewPayload = JSON.parse(updatePreview.content.find(item => item.type === 'text')?.text || '{}'); const updateCommit = await client.callTool({ name: 'customers.write', arguments: { ...updateArgs, mode: 'commit', previewId: updatePreviewPayload.previewId } }); ok(!updateCommit.isError && updateCommit.structuredContent?.committed === true, 'customer update preserves record via SDK')
  const duplicatePreview = await client.callTool({ name: 'customers.write', arguments: { ...customerArgs, idempotencyKey: 'sdk-http-customer-duplicate' } }); const duplicatePayload = JSON.parse(duplicatePreview.content.find(item => item.type === 'text')?.text || '{}'); let duplicateRejected = false; try { const duplicateResult = await client.callTool({ name: 'customers.write', arguments: { ...customerArgs, mode: 'commit', previewId: duplicatePayload.previewId } }); duplicateRejected = duplicateResult.isError === true } catch { duplicateRejected = true }; ok(duplicateRejected, 'customer identity duplicate rejected')
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const imageArgs = { mode: 'preview', productId: product.id, branchId: branch.id, dataBase64: png, contentType: 'image/png', idempotencyKey: 'sdk-http-image-1' }
  const imagePreview = await client.callTool({ name: 'product_images.write', arguments: imageArgs }); ok(!imagePreview.isError, 'product image preview via SDK')
  const imagePreviewPayload = JSON.parse(imagePreview.content.find(item => item.type === 'text')?.text || '{}')
  const imageCommit = await client.callTool({ name: 'product_images.write', arguments: { ...imageArgs, mode: 'commit', previewId: imagePreviewPayload.previewId } }); ok(!imageCommit.isError && imageCommit.structuredContent?.committed === true, 'product image commit via SDK')
  const imageRepeat = await client.callTool({ name: 'product_images.write', arguments: { ...imageArgs, mode: 'commit', previewId: imagePreviewPayload.previewId } }); ok(!imageRepeat.isError && imageRepeat.structuredContent?.idempotent === true, 'product image replay is idempotent')
  ok(await db.productImage.count({ where: { productId: product.id, deletedAt: null } }) === 1, 'product image replay creates one row')
  const foreignBranch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Sucursal ajena' } })
  const foreignProduct = await db.product.create({ data: { tenantId: tenant.id, branchId: foreignBranch.id, sku: 'SDK-FOREIGN', name: 'Foreign', pricePyg: 1000, stock: 1 } })
  let foreignDenied = false; try { await client.callTool({ name: 'product_images.write', arguments: { ...imageArgs, productId: foreignProduct.id, idempotencyKey: 'sdk-http-image-foreign' } }) } catch { foreignDenied = true }; ok(foreignDenied, 'foreign branch image denied')
  let badMime = false; try { await client.callTool({ name: 'product_images.write', arguments: { ...imageArgs, contentType: 'image/jpeg', idempotencyKey: 'sdk-http-image-mime' } }) } catch { badMime = true }; ok(badMime, 'image magic MIME mismatch rejected')
  let tooLarge = false; try { await client.callTool({ name: 'product_images.write', arguments: { ...imageArgs, dataBase64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(5 * 1024 * 1024)]).toString('base64'), idempotencyKey: 'sdk-http-image-large' } }) } catch { tooLarge = true }; ok(tooLarge, 'image max size rejected')
  await client.close()

  const raw = async (headers, body = '{}') => fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, ...headers }, body })
  const badOrigin = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }); ok(badOrigin.status === 403, 'invalid Origin rejected')
  const badMedia = await raw({ 'content-type': 'text/plain' }); ok(badMedia.status === 415, 'unsupported media type rejected')
  const verifier = 's'.repeat(43)
  const authCode = await issueMcpAuthorizationCode(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes, codeChallenge: pkceChallenge(verifier) })
  const tokenForm = (codeVerifier) => new URLSearchParams({ grant_type: 'authorization_code', client_id: 'sdk-http', code: authCode.code, redirect_uri: 'https://connector.example/callback', resource: mcpResource(), code_verifier: codeVerifier }).toString()
  const invalidPkce = await tokenPost(new Request(`${resource}/api/mcp/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenForm('t'.repeat(43)) })); ok(invalidPkce.status === 400, 'token rejects invalid PKCE before consuming code')
  const validPkce = await tokenPost(new Request(`${resource}/api/mcp/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenForm(verifier) })); ok(validPkce.status === 200 && (await validPkce.clone().json()).token_type === 'Bearer', 'token accepts valid PKCE after invalid attempt')
  const configuredClients = process.env.MOBOS_MCP_CLIENTS_JSON
  process.env.MOBOS_MCP_CLIENTS_JSON = '[]'
  const removedClient = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${issued.accessToken}` } }))
  ok(removedClient === null, 'revoked MCP client configuration invalidates bearer')
  process.env.MOBOS_MCP_CLIENTS_JSON = configuredClients
  console.log(`MCP SDK HTTP 1.32.1: ${checks} PASS (HTTP aislado; initialize/list/call/notification/Origin/media type)`)
} finally {
  if (httpServer) await new Promise(resolve => httpServer.close(resolve))
  await Promise.all(clients.map(db => db.$disconnect().catch(() => {})))
  if (pgStarted) command('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
}
