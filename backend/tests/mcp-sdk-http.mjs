import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_MCP_ENABLED: 'true', MOBOS_MCP_GRANT_MINUTE_LIMIT: '10000', MOBOS_MCP_TENANT_MINUTE_LIMIT: '100000', MOBOS_APP_URL: resource, MOBOS_MCP_RESOURCE: resource, MOBOS_MCP_ISSUER: resource, MOBOS_MCP_ALLOWED_ORIGINS: resource, MOBOS_MCP_CLIENTS_JSON: JSON.stringify([{ clientId: 'sdk-http', name: 'SDK HTTP', redirectUris: ['https://connector.example/callback'] }, { clientId: 'sdk-http-2', name: 'SDK HTTP 2', redirectUris: ['https://connector2.example/callback'] }]) })
  execFileSync(backend + '/node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', backend + '/prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: dbUrl }, cwd: backend, stdio: 'inherit' })
  if (process.env.MOBOS_MCP_DB_CHECK === '1') execFileSync(process.execPath, [backend + '/../scripts/check-db-schema.mjs'], { env: { ...process.env, DATABASE_URL: dbUrl }, cwd: backend, stdio: 'inherit' })
  require.extensions['.ts'] = (module, filename) => {
    const ts = require('typescript')
    module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  }
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const oauth = require('../lib/mcp/oauth.ts')
  const { updatePriceList } = require('../lib/price-list-service.ts')
  const { issueMcpAuthorizationCode, issueMcpTokens, rotateMcpRefreshToken, mcpResource, pkceChallenge, requireMcpAccessToken } = oauth
  const makeDb = () => { const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) }); clients.push(db); return db }
  const db = makeDb()
  const timezoneClock = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Asuncion'")
    const numeric = await tx.$queryRaw`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
    const current = await oauth.dbNow(tx)
    return Math.abs(current.getTime() - Number(numeric[0].nowMs))
  })
  ok(timezoneClock < 2000, 'MCP clock uses absolute PostgreSQL epoch in Asuncion timezone')

  const tenant = await db.tenant.create({ data: { name: 'SDK HTTP', slug: 'sdk-http', email: 'sdk@example.test' } })
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Centro' } })
  const account = await db.account.create({ data: { email: 'sdk-account@example.test' } })
  const user = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'SDK Admin', email: 'sdk-user@example.test', pinHash: 'unused', role: 'ADMIN' } })
  await db.tenantMembership.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, role: 'OWNER' } })
  const session = await db.session.create({ data: { tenantId: tenant.id, accountId: account.id, userId: user.id, level: 'SELLER', deviceId: 'sdk-http', tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600000) } })
  const scopes = ['products:write', 'prices:write', 'price_lists:read', 'price_lists:write', 'product_images:write', 'products:read', 'customers:read', 'customers:write', 'sales:read', 'sales:write', 'reports:read', 'company:read', 'company:write', 'company:create']
  const grant = await db.mcpClientGrant.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes } })
  const issued = await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource: mcpResource(), scopes })
  const issuedRow = await db.mcpAccessToken.findFirst({ where: { grantId: grant.id } })
  const absoluteRemaining = issuedRow.expiresAt.getTime() - (await oauth.dbNow(db)).getTime()
  ok(absoluteRemaining > 590000 && absoluteRemaining <= 600000, 'access token expiry is ten minutes of absolute DB time')
  const product = await db.product.create({ data: { tenantId: tenant.id, branchId: branch.id, sku: 'SDK-PRICE-1', name: 'SDK price', pricePyg: 1000, stock: 1 } })
  await db.product.createMany({ data: [1, 2, 3].map(n => ({ tenantId: tenant.id, branchId: branch.id, sku: `SDK-LIST-${n}`, name: `SDK list ${n}`, pricePyg: 1000 + n, stock: n })) })
  await db.customer.createMany({ data: [1, 2, 3].map(n => ({ tenantId: tenant.id, name: `SDK customer ${n}`, document: `CU-${n}` })) })
  const reportDate = new Date().toISOString().slice(0, 10)
  const reportAt = new Date(`${reportDate}T12:00:00.000Z`)
  const reportCustomer = await db.customer.create({ data: { tenantId: tenant.id, name: 'SDK report customer', document: 'CU-REPORT' } })
  const reportOrder = await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, customerId: reportCustomer.id, sellerId: user.id, orderNumber: 'SDK-REPORT-1', status: 'COMPLETED', subtotalPyg: 1000, totalPyg: 1000, createdAt: reportAt, items: { create: [{ description: 'Known cost', quantity: 1, unitPricePyg: 1000, totalPyg: 1000, unitCostPyg: 600 }] } } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, customerId: reportCustomer.id, sellerId: user.id, orderNumber: 'SDK-REPORT-ARCHIVED', status: 'COMPLETED', subtotalPyg: 750, totalPyg: 750, createdAt: reportAt, archivedAt: new Date(), items: { create: [{ description: 'Archived cost', quantity: 1, unitPricePyg: 750, totalPyg: 750, unitCostPyg: 400 }] } } })
  const originalPayment = await db.payment.create({ data: { tenantId: tenant.id, orderId: reportOrder.id, createdById: user.id, method: 'CASH', status: 'CONFIRMED', amountPyg: 1000, accountSnapshot: { id: 'cash', name: 'Caja', processor: 'cash' }, createdAt: reportAt } })
  await db.payment.create({ data: { tenantId: tenant.id, orderId: reportOrder.id, createdById: user.id, method: 'CASH', status: 'CONFIRMED', amountPyg: -1000, reversalOfId: originalPayment.id, createdAt: reportAt } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'SDK-REPORT-CANCELLED', status: 'CANCELLED', subtotalPyg: 2000, totalPyg: 2000, createdAt: reportAt } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'SDK-REPORT-UNKNOWN', status: 'COMPLETED', subtotalPyg: 500, totalPyg: 500, createdAt: reportAt, items: { create: [{ description: 'Unknown cost', quantity: 1, unitPricePyg: 500, totalPyg: 500 }] } } })

  const { POST } = require('../app/api/mcp/streamable/route.ts')
  const priceListById = require('../app/api/price-lists/[id]/route.ts')
  const ordersById = require('../app/api/orders/[orderId]/route.ts')
  const { GET: protectedResourceGet } = require('../app/.well-known/oauth-protected-resource/route.ts')
  const { GET: authorizeGet } = require('../app/api/mcp/authorize/route.ts')
  const { POST: tokenPost } = require('../app/api/mcp/token/route.ts')
  const browserCookie = 'mcp-get-cookie'
  const protectedMetadata = await protectedResourceGet()
  const protectedScopes = (await protectedMetadata.json()).scopes_supported
  ok(protectedMetadata.status === 200 && protectedScopes.includes('products:write') && protectedScopes.includes('price_lists:write') && protectedScopes.includes('company:create') && protectedScopes.includes('sales:write'), 'protected resource advertises only implemented MCP scopes')
  await db.session.update({ where: { id: session.id }, data: { tokenHash: createHash('sha256').update(browserCookie).digest('hex') } })
  const authQuery = new URLSearchParams({ response_type: 'code', client_id: 'sdk-http', redirect_uri: 'https://connector.example/callback', scope: 'products:read', resource, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', state: 'state+/=' })
  const { POST: disabledChanges } = require('../app/api/mcp/changes/route.ts')
  for (const disabled of [undefined, 'false', 'TRUE', '1']) {
    if (disabled === undefined) delete process.env.MOBOS_MCP_ENABLED; else process.env.MOBOS_MCP_ENABLED = disabled
    const beforeDisabled = await db.auditLog.count() + await db.authAttempt.count() + await db.mcpAuthorizationCode.count() + await db.mcpChangePreview.count()
    const blockedMetadata = await protectedResourceGet()
    const blockedConsent = await authorizeGet(new Request(`${resource}/api/mcp/authorize?${authQuery}`))
    const blockedToken = await tokenPost(new Request(`${resource}/api/mcp/token`, { method: 'POST', body: 'grant_type=refresh_token' }))
    const blockedAccess = await POST(new Request(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, 'content-type': 'application/json' }, body: '{}' }))
    const blockedChanges = await disabledChanges(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, 'content-type': 'application/json' }, body: '{}' }))
    ok([blockedMetadata, blockedConsent, blockedToken, blockedAccess, blockedChanges].every(response => response.status === 503), 'disabled MCP closes discovery/OAuth/existing bearer/changes before work')
    ok(beforeDisabled === await db.auditLog.count() + await db.authAttempt.count() + await db.mcpAuthorizationCode.count() + await db.mcpChangePreview.count(), 'disabled MCP leaves audit/quota/code/preview stores unchanged')
  }
  process.env.MOBOS_MCP_ENABLED = 'true'
  const consentGet = await authorizeGet(new Request(`${resource}/api/mcp/authorize?${authQuery}`, { headers: { cookie: `mobos_seller_session=${browserCookie}` } }))
  const consentBody = await consentGet.text(); ok(consentGet.status === 200 && consentBody.includes('Autorizar conexión'), 'OAuth consent GET without Origin uses trusted issuer URL and session cookie')
  const unauthGet = await authorizeGet(new Request(`${resource}/api/mcp/authorize?${authQuery}`))
  const loginLocation = unauthGet.headers.get('location') || ''
  const bridgeUrl = new URL(loginLocation)
  ok(unauthGet.status === 303 && bridgeUrl.pathname === '/mcp/autorizar' && bridgeUrl.searchParams.get('request') === `/api/mcp/authorize?${authQuery}`, 'unauthenticated consent GET redirects to login bridge')
  httpServer = createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const target = new URL(req.url || '/', resource)
      const request = new Request(target, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
      let response
      if (target.pathname.startsWith('/api/price-lists/')) {
        const id = target.pathname.split('/').pop()
        const handler = req.method === 'DELETE' ? priceListById.DELETE : req.method === 'PATCH' ? priceListById.PATCH : priceListById.GET
        response = await handler(request, { params: Promise.resolve({ id }) })
      } else if (target.pathname.startsWith('/api/orders/')) {
        const orderId = target.pathname.split('/').pop()
        response = await ordersById.PATCH(request, { params: Promise.resolve({ orderId }) })
      } else response = await POST(request)
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
  await client.ping(); ok(true, 'ping via StreamableHTTPClientTransport')
  const listed = await client.listTools(); ok(listed.tools.some(tool => tool.name === 'prices.write'), 'tools/list via SDK')
  ok(listed.tools.some(tool => tool.name === 'price_lists.read') && listed.tools.some(tool => tool.name === 'price_lists.write'), 'price list tools/list via SDK')
  ok(listed.tools.some(tool => tool.name === 'company.create'), 'company.create advertised via SDK')
  await client.notification({ method: 'notifications/initialized' }); ok(true, 'notification via SDK')
  ok(listed.tools.some(tool => tool.name === 'products.write'), 'products.write advertised via SDK')
  const Ajv = require('ajv')
  const ajv = new Ajv({ strict: false })
  for (const tool of listed.tools) {
    const schema = tool.inputSchema
    ok((schema.required ?? []).every(key => schema.properties?.[key]), `advertised required fields usable: ${tool.name}`)
    ajv.compile(schema)
  }
  for (const name of ['customers.write', 'company.write']) {
    const validate = ajv.compile(listed.tools.find(tool => tool.name === name).inputSchema)
    ok(validate({ mode: 'preview', name: 'Example', idempotencyKey: 'schema-request-1' }), `${name} accepts announced mutation payload`)
  }
  for (const [name, args] of [['products.read', { cursor: Buffer.from('[]').toString('base64url') }], ['sales.read', { cursor: Buffer.from(JSON.stringify({ id: 'x', createdAt: 'invalid' })).toString('base64url') }], ['reports.read', { from: '2026-02-30' }], ['company.read', { q: 'not-supported' }]]) {
    let rejected = false
    try { await client.callTool({ name, arguments: args }) } catch { rejected = true }
    ok(rejected, `reject unsupported or invalid read arguments: ${name}`)
  }
  const productArgs = { mode: 'preview', operation: 'create', branchId: branch.id, name: 'MCP product', sku: 'MCP-PRODUCT-1', category: 'Accesorios', pricePyg: 2500, idempotencyKey: 'sdk-http-product-1' }
  const productPreview = await client.callTool({ name: 'products.write', arguments: productArgs }); ok(!productPreview.isError, 'product create preview via SDK')
  const productPreviewPayload = JSON.parse(productPreview.content.find(item => item.type === 'text')?.text || '{}')
  const productCommit = await client.callTool({ name: 'products.write', arguments: { ...productArgs, mode: 'commit', previewId: productPreviewPayload.previewId } }); ok(!productCommit.isError && productCommit.structuredContent?.committed === true, 'product create commit via SDK')
  const productRepeat = await client.callTool({ name: 'products.write', arguments: { ...productArgs, mode: 'commit', previewId: productPreviewPayload.previewId } }); ok(!productRepeat.isError && productRepeat.structuredContent?.idempotent === true, 'product create replay idempotent')
  const productUpdateArgs = { mode: 'preview', operation: 'update', productId: productCommit.structuredContent.entityId, name: 'MCP product updated', idempotencyKey: 'sdk-http-product-2' }
  const productUpdatePreview = await client.callTool({ name: 'products.write', arguments: productUpdateArgs }); const productUpdatePayload = JSON.parse(productUpdatePreview.content.find(item => item.type === 'text')?.text || '{}'); const productUpdate = await client.callTool({ name: 'products.write', arguments: { ...productUpdateArgs, mode: 'commit', previewId: productUpdatePayload.previewId } }); ok(!productUpdate.isError && productUpdate.structuredContent?.committed === true, 'product update commit via SDK')
  for (const name of ['SDK list A', 'SDK list B', 'SDK list C']) await db.priceList.create({ data: { tenantId: tenant.id, name } })
  const listArgs = { mode: 'preview', operation: 'create', name: 'SDK list MCP', replaceItems: true, items: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg: 900 }], idempotencyKey: 'sdk-http-list-1' }
  const listPreview = await client.callTool({ name: 'price_lists.write', arguments: listArgs }); ok(!listPreview.isError, 'price_lists.write preview via SDK')
  const listPreviewPayload = JSON.parse(listPreview.content.find(item => item.type === 'text')?.text || '{}'); ok(Array.isArray(listPreviewPayload.after?.items) && listPreviewPayload.after.items.length === 1, 'price list preview includes normalized items')
  const listCommit = await client.callTool({ name: 'price_lists.write', arguments: { ...listArgs, mode: 'commit', previewId: listPreviewPayload.previewId } }); ok(!listCommit.isError && listCommit.structuredContent?.committed === true, 'price_lists.write commit via SDK')
  const listRepeat = await client.callTool({ name: 'price_lists.write', arguments: { ...listArgs, mode: 'commit', previewId: listPreviewPayload.previewId } }); ok(!listRepeat.isError && listRepeat.structuredContent?.idempotent === true, 'price_lists.write replay idempotent')
  const listPage = await client.callTool({ name: 'price_lists.read', arguments: { limit: 2 } }); ok(!listPage.isError && listPage.structuredContent?.items?.length === 2 && listPage.structuredContent?.nextCursor, 'price_lists.read first cursor page')
  const listPage2 = await client.callTool({ name: 'price_lists.read', arguments: { limit: 2, cursor: listPage.structuredContent.nextCursor } }); ok(!listPage2.isError && listPage2.structuredContent?.items?.length >= 1 && !listPage2.structuredContent.items.some(row => listPage.structuredContent.items.some(prev => prev.id === row.id)), 'price_lists.read cursor has no duplicates')
  const staleListArgs = { mode: 'preview', operation: 'update', priceListId: listCommit.structuredContent.entityId, name: 'SDK list MCP revised', idempotencyKey: 'sdk-http-list-stale' }; const staleListPreview = await client.callTool({ name: 'price_lists.write', arguments: staleListArgs }); const staleListPayload = JSON.parse(staleListPreview.content.find(item => item.type === 'text')?.text || '{}'); await db.priceList.update({ where: { id: listCommit.structuredContent.entityId }, data: { name: 'SDK list changed elsewhere' } }); let staleListDenied = false; try { await client.callTool({ name: 'price_lists.write', arguments: { ...staleListArgs, mode: 'commit', previewId: staleListPayload.previewId } }) } catch { staleListDenied = true }; ok(staleListDenied, 'price_lists.write rejects stale preview after concurrent change')
  const rollbackList = await db.priceList.create({ data: { tenantId: tenant.id, name: 'SDK rollback list' } }); let rollbackThrown = false; try { await db.$transaction(async tx => { await updatePriceList(tx, { id: user.id, tenantId: tenant.id, role: 'ADMIN' }, rollbackList.id, { name: 'SDK rollback changed', items: [], replaceItems: true }); throw new Error('forced rollback') }) } catch { rollbackThrown = true }; const rollbackCheck = await db.priceList.findUnique({ where: { id: rollbackList.id }, select: { name: true } }); ok(rollbackThrown && rollbackCheck?.name === 'SDK rollback list', 'price list item replacement rolls back atomically')
  const raceList = await db.priceList.create({ data: { tenantId: tenant.id, name: 'SDK item CAS list', items: { create: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg: 901, tiers: { create: [{ minQty: 5, unitPricePyg: 850 }] } }] } } })
  const itemRace = (unitPricePyg, idempotencyKey) => ({ mode: 'preview', operation: 'update', priceListId: raceList.id, replaceItems: true, items: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg, tiers: [{ minQty: 5, unitPricePyg: unitPricePyg - 50 }] }], idempotencyKey })
  const itemRacePreviewA = await client.callTool({ name: 'price_lists.write', arguments: itemRace(910, 'sdk-http-list-race-a') }); const itemRacePayloadA = JSON.parse(itemRacePreviewA.content.find(item => item.type === 'text')?.text || '{}')
  const itemRacePreviewB = await client.callTool({ name: 'price_lists.write', arguments: itemRace(920, 'sdk-http-list-race-b') }); const itemRacePayloadB = JSON.parse(itemRacePreviewB.content.find(item => item.type === 'text')?.text || '{}')
  const realDateNow = Date.now; Date.now = () => 1735689600000
  let itemRaceResults
  try {
    itemRaceResults = await Promise.all([itemRacePayloadA.previewId, itemRacePayloadB.previewId].map((previewId, index) => client.callTool({ name: 'price_lists.write', arguments: { ...itemRace(index === 0 ? 910 : 920, index === 0 ? 'sdk-http-list-race-a' : 'sdk-http-list-race-b'), mode: 'commit', previewId } }).catch(() => ({ isError: true }))))
  } finally { Date.now = realDateNow }
  const itemRaceWinners = itemRaceResults.filter(result => !result.isError && result.structuredContent?.committed === true).length
  const itemRaceRow = await db.priceList.findUnique({ where: { id: raceList.id }, include: { items: { include: { tiers: true } } } })
  const itemRaceAudits = await db.auditLog.count({ where: { tenantId: tenant.id, entity: 'PriceList', entityId: raceList.id, action: 'PRICE_LIST_UPDATED' } })
  const winningPrice = itemRaceRow?.items[0]?.unitPricePyg?.toString()
  ok(itemRaceWinners === 1 && ['910', '920'].includes(winningPrice) && itemRaceRow?.items[0]?.tiers.length === 1 && itemRaceAudits === 1, 'price list item-only previews have one CAS winner and one audit')
  // Real HTTP race: an old MCP preview must not be committed after a web
  // item-only edit followed by a web deactivation under the same clock.
  const deleteRaceList = await db.priceList.create({ data: { tenantId: tenant.id, name: 'SDK HTTP delete race', items: { create: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg: 930, tiers: { create: [{ minQty: 2, unitPricePyg: 900 }] } }] } } })
  const deleteRaceArgs = { mode: 'preview', operation: 'update', priceListId: deleteRaceList.id, replaceItems: true, items: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg: 940, tiers: [{ minQty: 2, unitPricePyg: 910 }] }], idempotencyKey: 'sdk-http-delete-race' }
  const deleteRacePreview = await client.callTool({ name: 'price_lists.write', arguments: deleteRaceArgs }); const deleteRacePayload = JSON.parse(deleteRacePreview.content.find(item => item.type === 'text')?.text || '{}')
  const fixedNow = Date.now; Date.now = () => 1735689600000
  try {
    // Web routes use the application session cookie; an MCP bearer is only for
    // the connector transport and must never be treated as a web session.
    const webHeaders = { cookie: `mobos_seller_session=${browserCookie}`, origin: resource, 'content-type': 'application/json' }
    const editResponse = await fetch(`${resource}/api/price-lists/${deleteRaceList.id}`, { method: 'PATCH', headers: webHeaders, body: JSON.stringify({ replaceItems: true, items: [{ scope: 'PRODUCT', productId: product.id, unitPricePyg: 950, tiers: [{ minQty: 2, unitPricePyg: 920 }] }] }) })
    ok(editResponse.status === 200, 'HTTP item-only edit advances list version')
    const deleteResponse = await fetch(`${resource}/api/price-lists/${deleteRaceList.id}`, { method: 'DELETE', headers: webHeaders })
    ok(deleteResponse.status === 200 && (await deleteResponse.json()).isActive === false, 'HTTP DELETE deactivates list through versioned service')
    let staleDeleteDenied = false
    try { await client.callTool({ name: 'price_lists.write', arguments: { ...deleteRaceArgs, mode: 'commit', previewId: deleteRacePayload.previewId } }) } catch { staleDeleteDenied = true }
    const deleteRaceRow = await db.priceList.findUnique({ where: { id: deleteRaceList.id }, include: { items: { include: { tiers: true } } } })
    const deleteRaceAudits = await db.auditLog.count({ where: { tenantId: tenant.id, entity: 'PriceList', entityId: deleteRaceList.id, action: 'PRICE_LIST_DEACTIVATED' } })
    ok(staleDeleteDenied && deleteRaceRow?.isActive === false && deleteRaceRow.items[0]?.unitPricePyg === 950n && deleteRaceRow.items[0]?.tiers[0]?.unitPricePyg === 920n && deleteRaceAudits === 1, 'old MCP preview is rejected after HTTP edit plus DELETE with same clock')
  } finally { Date.now = fixedNow }
  const preview = await client.callTool({ name: 'prices.write', arguments: { mode: 'preview', productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!preview.isError && JSON.stringify(preview).includes('previewId'), 'prices.write preview via SDK')
  const previewText = preview.content.find(item => item.type === 'text')?.text || ''
  const previewPayload = JSON.parse(previewText)
  const grant2 = await db.mcpClientGrant.create({ data: { accountId: account.id, tenantId: tenant.id, userId: user.id, clientId: 'sdk-http-2', redirectUri: 'https://connector2.example/callback', resource: mcpResource(), scopes: ['prices:write'] } })
  const issued2 = await issueMcpTokens(db, { grantId: grant2.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http-2', resource: mcpResource(), scopes: ['prices:write'] })
  const crossConnector = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued2.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 77, method: 'tools/call', params: { name: 'prices.write', arguments: { mode: 'commit', previewId: previewPayload.previewId, productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } } }) })
  const crossPayload = await crossConnector.json(); ok(Boolean(crossPayload.error), 'cross-connector preview commit rejected')
  const committed = await client.callTool({ name: 'prices.write', arguments: { mode: 'commit', previewId: previewPayload.previewId, productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!committed.isError && committed.structuredContent?.committed === true, 'prices.write commit via SDK')
  const repeat = await client.callTool({ name: 'prices.write', arguments: { mode: 'commit', previewId: previewPayload.previewId, productId: product.id, pricePyg: 1100, expectedPricePyg: 1000, idempotencyKey: 'sdk-http-price-1' } }); ok(!repeat.isError && repeat.structuredContent?.committed === true && repeat.structuredContent?.previewId === committed.structuredContent?.previewId, 'prices.write idempotent commit via SDK')
  const raceBeforeAudit = await db.auditLog.count({ where: { tenantId: tenant.id, action: 'PRODUCT_PRICE_UPDATED', entityId: product.id } })
  const raceArgs = { mode: 'preview', productId: product.id, expectedPricePyg: 1100 }
  const racePreviewA = await client.callTool({ name: 'prices.write', arguments: { ...raceArgs, pricePyg: 1300, idempotencyKey: 'sdk-http-price-race-a' } })
  const racePreviewB = await client.callTool({ name: 'prices.write', arguments: { ...raceArgs, pricePyg: 1400, idempotencyKey: 'sdk-http-price-race-b' } })
  const raceA = JSON.parse(racePreviewA.content.find(item => item.type === 'text')?.text || '{}')
  const raceB = JSON.parse(racePreviewB.content.find(item => item.type === 'text')?.text || '{}')
  const raceResults = await Promise.allSettled([
    client.callTool({ name: 'prices.write', arguments: { ...raceArgs, pricePyg: 1300, idempotencyKey: 'sdk-http-price-race-a', mode: 'commit', previewId: raceA.previewId } }),
    client.callTool({ name: 'prices.write', arguments: { ...raceArgs, pricePyg: 1400, idempotencyKey: 'sdk-http-price-race-b', mode: 'commit', previewId: raceB.previewId } }),
  ])
  ok(raceResults.filter(result => result.status === 'fulfilled').length === 1 && raceResults.filter(result => result.status === 'rejected').length === 1, 'prices.write CAS race has one winner and one conflict')
  const raceAfterAudit = await db.auditLog.count({ where: { tenantId: tenant.id, action: 'PRODUCT_PRICE_UPDATED', entityId: product.id } })
  ok(raceAfterAudit - raceBeforeAudit === 1, 'prices.write CAS conflict creates no extra price audit')
  const revokedPreview = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued2.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 78, method: 'tools/call', params: { name: 'prices.write', arguments: { mode: 'preview', productId: product.id, pricePyg: 1200, expectedPricePyg: 1100, idempotencyKey: 'sdk-http-price-revoked' } } }) })
  const revokedPreviewPayload = await revokedPreview.json(); const revokedPreviewId = JSON.parse(revokedPreviewPayload.result?.structuredContent ? JSON.stringify(revokedPreviewPayload.result.structuredContent) : revokedPreviewPayload.result?.content?.[0]?.text || '{}').previewId
  await db.mcpClientGrant.update({ where: { id: grant2.id }, data: { revokedAt: new Date() } })
  const revokedCommit = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued2.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 79, method: 'tools/call', params: { name: 'prices.write', arguments: { mode: 'commit', previewId: revokedPreviewId, productId: product.id, pricePyg: 1200, expectedPricePyg: 1100, idempotencyKey: 'sdk-http-price-revoked' } } }) })
  const revokedPayload = await revokedCommit.json(); ok(revokedCommit.status === 401 || Boolean(revokedPayload.error), 'revoked connector preview cannot commit')
  let invalid = false; try { await client.callTool({ name: 'prices.write', arguments: { mode: 'preview', idempotencyKey: 'sdk-http-bad' } }) } catch { invalid = true }; ok(invalid, 'invalid arguments return MCP protocol error')
  ok(listed.tools.some(tool => tool.name === 'product_images.write'), 'product_images.write advertised via SDK')
  const productPage = await client.callTool({ name: 'products.read', arguments: { limit: 2 } }); ok(!productPage.isError && Array.isArray(productPage.structuredContent?.items) && productPage.structuredContent.items.length === 2 && productPage.structuredContent.nextCursor, 'products.read first cursor page')
  const productPage2 = await client.callTool({ name: 'products.read', arguments: { limit: 2, cursor: productPage.structuredContent.nextCursor } }); ok(!productPage2.isError && productPage2.structuredContent.items.length > 0 && !productPage2.structuredContent.items.some(row => productPage.structuredContent.items.some(prev => prev.id === row.id)), 'products.read cursor has no duplicates')
  const customerPage = await client.callTool({ name: 'customers.read', arguments: { limit: 2 } }); ok(!customerPage.isError && customerPage.structuredContent.items.length === 2 && customerPage.structuredContent.nextCursor, 'customers.read first cursor page')
  const salesPage = await client.callTool({ name: 'sales.read', arguments: { limit: 2 } }); ok(!salesPage.isError && salesPage.structuredContent.items.length === 2 && salesPage.structuredContent.nextCursor, 'sales.read first cursor page')
  const salesPage2 = await client.callTool({ name: 'sales.read', arguments: { limit: 2, cursor: salesPage.structuredContent.nextCursor } }); ok(!salesPage2.isError && salesPage2.structuredContent.items.length > 0 && !salesPage2.structuredContent.items.some(row => salesPage.structuredContent.items.some(prev => prev.id === row.id)), 'sales.read cursor has no duplicates')
  const report = await client.callTool({ name: 'reports.read', arguments: { from: reportDate, to: reportDate, groupBy: 'product', tzOffset: 0 } }); ok(!report.isError && report.structuredContent.totals && report.structuredContent.totals.orders === 3 && report.structuredContent.totals.linesWithoutCost === 1, 'reports.read period/cancelled/unknown-cost rules')
  const otherBranch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Sucursal reportes' } })
  await db.order.create({ data: { tenantId: tenant.id, branchId: otherBranch.id, sellerId: user.id, orderNumber: 'SDK-REPORT-OTHER', status: 'COMPLETED', subtotalPyg: 300, totalPyg: 300, createdAt: reportAt } })
  const salesOtherBranch = await client.callTool({ name: 'sales.read', arguments: { branchId: otherBranch.id, limit: 10 } }); ok(!salesOtherBranch.isError && salesOtherBranch.structuredContent.items.some(row => row.orderNumber === 'SDK-REPORT-OTHER') && !salesOtherBranch.structuredContent.items.some(row => row.orderNumber === 'SDK-REPORT-1'), 'sales.read filters requested branch for admin')
  let salesQDenied = false; try { await client.callTool({ name: 'sales.read', arguments: { q: 'ignored' } }) } catch { salesQDenied = true }; ok(salesQDenied, 'sales.read rejects unsupported q argument')
  const branchReport = await client.callTool({ name: 'reports.read', arguments: { branchId: branch.id, from: reportDate, to: reportDate, groupBy: 'product', tzOffset: 0 } }); ok(!branchReport.isError && branchReport.structuredContent.totals.orders === 3, 'reports.read filters active branch')
  const otherBranchReport = await client.callTool({ name: 'reports.read', arguments: { branchId: otherBranch.id, from: reportDate, to: reportDate, groupBy: 'product', tzOffset: 0 } }); ok(!otherBranchReport.isError && otherBranchReport.structuredContent.totals.orders === 1, 'reports.read selects another active branch')
  const inactiveBranch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Sucursal inactiva', isActive: false } })
  const foreignTenant = await db.tenant.create({ data: { name: 'Otro tenant', slug: 'sdk-foreign', email: 'foreign-sdk@example.test' } })
  const foreignReportBranch = await db.branch.create({ data: { tenantId: foreignTenant.id, name: 'Sucursal extranjera' } })
  let inactiveDenied = false; try { await client.callTool({ name: 'reports.read', arguments: { branchId: inactiveBranch.id, from: reportDate, to: reportDate } }) } catch { inactiveDenied = true }; ok(inactiveDenied, 'reports.read rejects inactive branch')
  let foreignReportDenied = false; try { await client.callTool({ name: 'reports.read', arguments: { branchId: foreignReportBranch.id, from: reportDate, to: reportDate } }) } catch { foreignReportDenied = true }; ok(foreignReportDenied, 'reports.read rejects foreign tenant branch')
  const gerente = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Gerente reportes', email: 'gerente-reportes@example.test', pinHash: 'unused', role: 'GERENTE', permissions: ['reports:read'] } })
  const gerenteSession = await db.session.create({ data: { tenantId: tenant.id, userId: gerente.id, level: 'SELLER', deviceId: 'gerente-reportes', tokenHash: 'd'.repeat(64), expiresAt: new Date(Date.now() + 3600000) } })
  const gerenteGrant = await db.mcpClientGrant.create({ data: { accountId: null, tenantId: tenant.id, userId: gerente.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes: ['reports:read'] } })
  const gerenteTokens = await issueMcpTokens(db, { grantId: gerenteGrant.id, accountId: null, tenantId: tenant.id, sessionId: gerenteSession.id, userId: gerente.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['reports:read'] })
  const gerenteReport = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${gerenteTokens.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 161, method: 'tools/call', params: { name: 'reports.read', arguments: { branchId: otherBranch.id, from: reportDate, to: reportDate, groupBy: 'product', tzOffset: 0 } } }) })
  const gerenteReportPayload = await gerenteReport.json(); ok(gerenteReport.status === 200 && !gerenteReportPayload.error && gerenteReportPayload.result?.structuredContent?.totals?.orders === 1, 'GERENTE reports.read can select another active branch in same tenant')
  const gerenteForeign = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${gerenteTokens.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 162, method: 'tools/call', params: { name: 'reports.read', arguments: { branchId: foreignReportBranch.id, from: reportDate, to: reportDate } } }) })
  const gerenteForeignPayload = await gerenteForeign.json(); ok(gerenteForeign.status === 200 && Boolean(gerenteForeignPayload.error), 'GERENTE reports.read rejects foreign tenant branch')
  let unknownArgDenied = false; try { await client.callTool({ name: 'products.read', arguments: { nope: true } }) } catch { unknownArgDenied = true }; ok(unknownArgDenied, 'tools/call rejects unknown arguments')
  let badLimitDenied = false; try { await client.callTool({ name: 'products.read', arguments: { limit: 0 } }) } catch { badLimitDenied = true }; ok(badLimitDenied, 'tools/call rejects out-of-range limit')
  const paymentReport = await client.callTool({ name: 'reports.read', arguments: { from: reportDate, to: reportDate, groupBy: 'payments', paymentsBy: 'account', tzOffset: 0 } }); const reportGroups = paymentReport.structuredContent.groups || []; ok(reportGroups.some(group => group.key === 'cash'), 'reports.read payment account snapshot grouping')
  const badCursor = await client.callTool({ name: 'products.read', arguments: { cursor: 'invalid' } }).then(() => false).catch(() => true); ok(badCursor, 'invalid cursor rejected')
  ok(listed.tools.some(tool => tool.name === 'company.write'), 'company.write advertised via SDK')
  const companyArgs = { mode: 'preview', ruc: '80012345-6', address: 'Av. MCP 123', idempotencyKey: 'sdk-http-company-1' }
  const companyPreview = await client.callTool({ name: 'company.write', arguments: companyArgs }); const companyPreviewPayload = JSON.parse(companyPreview.content.find(item => item.type === 'text')?.text || '{}'); let staleRejected = false; try { await client.callTool({ name: 'company.write', arguments: { ...companyArgs, mode: 'commit', previewId: companyPreviewPayload.previewId } }) } catch { staleRejected = true }; ok(staleRejected, 'company write requires recent reauthentication')
  await db.session.update({ where: { id: session.id }, data: { reauthenticatedAt: new Date() } })
  const companyCommit = await client.callTool({ name: 'company.write', arguments: { ...companyArgs, mode: 'commit', previewId: companyPreviewPayload.previewId } }); ok(!companyCommit.isError && companyCommit.structuredContent?.committed === true, 'company write after recent reauthentication')
  const companyRepeat = await client.callTool({ name: 'company.write', arguments: { ...companyArgs, mode: 'commit', previewId: companyPreviewPayload.previewId } }); ok(!companyRepeat.isError && companyRepeat.structuredContent?.idempotent === true, 'company write replay idempotent')
  const companyCreate = await client.callTool({ name: 'company.create', arguments: { companyName: 'Nueva empresa MCP' } }); ok(companyCreate.structuredContent?.status === 'awaiting_app_confirmation' && companyCreate.structuredContent?.expectedTenantId === tenant.id && companyCreate.structuredContent?.expectedUserId === user.id, 'company.create prepares app confirmation without writes')
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
  const raw = async (headers, body = '{}') => fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, ...headers }, body })
  const guardedSnapshot = async () => JSON.stringify(await Promise.all([db.product.count(), db.customer.count(), db.priceList.count(), db.productImage.count(), db.tenant.findUnique({ where: { id: tenant.id }, select: { address: true } }), db.product.findUnique({ where: { id: product.id }, select: { pricePyg: true } }), db.order.findUnique({ where: { id: reportOrder.id }, select: { notes: true } })]), (_, value) => typeof value === 'bigint' ? String(value) : value)
  const ttlDomains = [
    ['products.write', { ...productArgs, sku: 'TTL-PRODUCT' }],
    ['prices.write', { mode: 'preview', productId: product.id, pricePyg: 2200, expectedPricePyg: Number((await db.product.findUnique({ where: { id: product.id } })).pricePyg) }],
    ['price_lists.write', { ...listArgs, name: 'TTL price list' }],
    ['customers.write', { ...customerArgs, document: 'TTL-CUSTOMER' }],
    ['company.write', { ...companyArgs, address: 'TTL address' }],
    ['product_images.write', { ...imageArgs }],
  ]
  for (const [name, value] of ttlDomains) {
    const args = { ...value, idempotencyKey: `sdk-ttl-${name}` }
    const prepared = await client.callTool({ name, arguments: args })
    const previewId = prepared.structuredContent.previewId
    await db.mcpChangePreview.update({ where: { id: previewId }, data: { expiresAt: new Date(Date.now() + 1700) } })
    let locked
    const ready = new Promise(resolve => { locked = resolve })
    const lock = makeDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "McpChangePreview" WHERE id = ${previewId} FOR UPDATE`
      locked(); await tx.$executeRaw`SELECT pg_sleep(2.4)`
    })
    await ready
    const before = await guardedSnapshot()
    const audits = await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED' } })
    let denied = false; try { await client.callTool({ name, arguments: { ...args, mode: 'commit', previewId } }) } catch { denied = true }
    await lock
    ok(denied && before === await guardedSnapshot() && audits === await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED' } }) && (await db.mcpChangePreview.findUnique({ where: { id: previewId } })).status === 'PREVIEW', `${name} expiry after preview lock rolls back mutation and audit`)
  }
  const badOrigin = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }); ok(badOrigin.status === 403, 'invalid Origin rejected')
  const invalidBearer = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: 'Bearer invalid', origin: resource, 'content-type': 'application/json' }, body: '{}' }); ok(invalidBearer.status === 401 && invalidBearer.headers.get('www-authenticate') === `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource"`, 'invalid bearer has absolute resource metadata challenge')
  const oversized = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 90, method: 'tools/call', params: { name: 'products.read', arguments: { q: 'x'.repeat(7_100_000) } } }) }); ok(oversized.status === 413, 'oversized MCP JSON body rejected')
  let chunkCancelled = false
  const oversizedStream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(7_100_001))); controller.enqueue(new TextEncoder().encode('should-not-be-read')) }, cancel() { chunkCancelled = true } })
  const boundedResponse = await POST(new Request(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: oversizedStream, duplex: 'half' }))
  ok(boundedResponse.status === 413 && chunkCancelled, 'chunked MCP body cancels reader at byte limit')
  const badMedia = await raw({ 'content-type': 'text/plain' }); ok(badMedia.status === 415, 'unsupported media type rejected')
  const verifier = 's'.repeat(43)
  const authCode = await issueMcpAuthorizationCode(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes, codeChallenge: pkceChallenge(verifier) })
  const tokenForm = (codeVerifier) => new URLSearchParams({ grant_type: 'authorization_code', client_id: 'sdk-http', code: authCode.code, redirect_uri: 'https://connector.example/callback', resource: mcpResource(), code_verifier: codeVerifier }).toString()
  const invalidPkce = await tokenPost(new Request(`${resource}/api/mcp/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenForm('t'.repeat(43)) })); ok(invalidPkce.status === 400, 'token rejects invalid PKCE before consuming code')
  const validPkce = await tokenPost(new Request(`${resource}/api/mcp/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenForm(verifier) })); ok(validPkce.status === 200 && (await validPkce.clone().json()).token_type === 'Bearer', 'token accepts valid PKCE after invalid attempt')
  const pinUser = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'PIN gerente', email: 'pin-gerente@example.test', pinHash: 'unused', role: 'GERENTE', permissions: ['products:read'] } })
  const pinSession = await db.session.create({ data: { tenantId: tenant.id, userId: pinUser.id, level: 'SELLER', deviceId: 'pin-device', tokenHash: 'c'.repeat(64), expiresAt: new Date(Date.now() + 3600000) } })
  const pinGrant = await db.mcpClientGrant.create({ data: { accountId: null, tenantId: tenant.id, userId: pinUser.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes: ['products:read'] } })
  const pinTokens = await issueMcpTokens(db, { grantId: pinGrant.id, accountId: null, tenantId: tenant.id, sessionId: pinSession.id, userId: pinUser.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['products:read'] }); const pinAuth = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${pinTokens.accessToken}` } })); ok(pinAuth?.user.id === pinUser.id && pinAuth.accountId === null, 'PIN role without account can authorize MCP safely')
  const pinListDenied = await fetch(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${pinTokens.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 81, method: 'tools/call', params: { name: 'price_lists.read', arguments: {} } }) }); ok(Boolean((await pinListDenied.json()).error), 'price list read denied for PIN role without granted scope')
  await db.user.update({ where: { id: pinUser.id }, data: { status: 'INACTIVE' } }); const disabledPin = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${pinTokens.accessToken}` } })); ok(disabledPin === null, 'disabled PIN user loses MCP access')
  await db.user.update({ where: { id: pinUser.id }, data: { status: 'ACTIVE' } })
  await db.session.update({ where: { id: pinSession.id }, data: { revokedAt: new Date() } }); const revokedPin = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${pinTokens.accessToken}` } })); ok(revokedPin === null, 'revoked PIN session loses MCP access')
  await db.session.update({ where: { id: pinSession.id }, data: { revokedAt: null } })
  await db.tenant.update({ where: { id: tenant.id }, data: { archivedAt: new Date() } }); const archivedPin = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${pinTokens.accessToken}` } })); ok(archivedPin === null, 'archived tenant loses MCP access')
  let archivedIssueDenied = false; try { await issueMcpTokens(db, { grantId: pinGrant.id, accountId: null, tenantId: tenant.id, sessionId: pinSession.id, userId: pinUser.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['products:read'] }) } catch { archivedIssueDenied = true }; ok(archivedIssueDenied, 'archived tenant cannot issue MCP token')
  let archivedRefreshDenied = false; try { await rotateMcpRefreshToken(db, pinTokens.refreshToken, 'sdk-http') } catch { archivedRefreshDenied = true }; ok(archivedRefreshDenied, 'archived tenant cannot refresh MCP token')
  await db.tenant.update({ where: { id: tenant.id }, data: { archivedAt: null } })
  const pinUser2 = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'PIN vendedor', email: 'pin-vendedor@example.test', pinHash: 'unused', role: 'VENDEDOR', permissions: ['products:read'] } })
  const pinGrant2 = await db.mcpClientGrant.create({ data: { accountId: null, tenantId: tenant.id, userId: pinUser2.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/callback', resource: mcpResource(), scopes: ['products:read'] } }); ok(pinGrant2.id !== pinGrant.id, 'PIN users have independent grants')
  const configuredClients = process.env.MOBOS_MCP_CLIENTS_JSON
  process.env.MOBOS_MCP_CLIENTS_JSON = '[]'
  const removedClient = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${issued.accessToken}` } }))
  ok(removedClient === null, 'revoked MCP client configuration invalidates bearer')
  process.env.MOBOS_MCP_CLIENTS_JSON = configuredClients
  const noteTool = listed.tools.find(tool => tool.name === 'sales.write')
  ok(noteTool?.inputSchema.properties.operation.enum.join() === 'update_note', 'sales.write advertises only existing-order comment updates')
  const noteCall = args => client.callTool({ name: 'sales.write', arguments: args })
  const noteArgs = { mode: 'preview', operation: 'update_note', orderId: reportOrder.id, notes: '  Called client  ', idempotencyKey: 'sdk-note-first' }
  const beforeNote = await db.order.findUnique({ where: { id: reportOrder.id }, include: { items: true, payments: true } })
  const stockBeforeNote = await db.product.findUnique({ where: { id: product.id }, select: { stock: true } })
  const notePreview = await noteCall(noteArgs)
  ok(notePreview.structuredContent.after.notes === 'Called client' && (await db.order.findUnique({ where: { id: reportOrder.id } })).notes === beforeNote.notes, 'note preview normalizes text without mutating order')
  const noteCommit = await noteCall({ ...noteArgs, mode: 'commit', previewId: notePreview.structuredContent.previewId })
  ok(noteCommit.structuredContent.committed === true && noteCommit.structuredContent.order.notes === 'Called client', 'note commit uses shared guarded service')
  const noteReplay = await noteCall({ ...noteArgs, mode: 'commit', previewId: notePreview.structuredContent.previewId })
  ok(noteReplay.structuredContent.idempotent === true, 'note commit replay is idempotent')
  ok(await db.auditLog.count({ where: { entityId: reportOrder.id, action: 'MCP_CHANGE_COMMITTED' } }) === 1, 'note commit audit written exactly once')
  const afterNote = await db.order.findUnique({ where: { id: reportOrder.id }, include: { items: true, payments: true } })
  ok(String(afterNote.totalPyg) === String(beforeNote.totalPyg) && afterNote.status === beforeNote.status && JSON.stringify(afterNote.items) === JSON.stringify(beforeNote.items) && JSON.stringify(afterNote.payments) === JSON.stringify(beforeNote.payments) && (await db.product.findUnique({ where: { id: product.id }, select: { stock: true } })).stock === stockBeforeNote.stock, 'note update cannot change money, fulfillment, items, payments or stock')
  const prepareNote = async (key, notes = key) => { const args = { ...noteArgs, notes, idempotencyKey: key }; const result = await noteCall(args); return { ...args, mode: 'commit', previewId: result.structuredContent.previewId } }
  const [noteParallelA, noteParallelB] = await Promise.all([prepareNote('sdk-note-parallel-a'), prepareNote('sdk-note-parallel-b')])
  const noteParallel = await Promise.allSettled([noteCall(noteParallelA), noteCall(noteParallelB)])
  ok(noteParallel.filter(result => result.status === 'fulfilled').length === 1 && noteParallel.filter(result => result.status === 'rejected').length === 1, 'parallel note previews claim one version without lost updates')
  await db.order.update({ where: { id: reportOrder.id }, data: { updatedAt: new Date('2035-01-01T00:00:00.000Z') } })
  const staleNote = await prepareNote('sdk-note-stale')
  const webNote = await fetch(`${resource}/api/orders/${reportOrder.id}`, { method: 'PATCH', headers: { cookie: `mobos_seller_session=${browserCookie}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'Web comment' }) })
  ok(webNote.status === 200 && new Date((await webNote.json()).updatedAt) > new Date('2035-01-01T00:00:00.000Z'), 'web comment editor advances shared version even ahead of DB clock')
  let staleNoteDenied = false; try { await noteCall(staleNote) } catch { staleNoteDenied = true }
  ok(staleNoteDenied && (await db.order.findUnique({ where: { id: reportOrder.id } })).notes === 'Web comment', 'web change invalidates old MCP note preview')
  const lockExpiry = await prepareNote('sdk-note-lock-expiry')
  await db.mcpChangePreview.update({ where: { id: lockExpiry.previewId }, data: { expiresAt: new Date(Date.now() + 1400) } })
  let acquiredOrderLock
  const orderLockReady = new Promise(resolve => { acquiredOrderLock = resolve })
  const orderLock = makeDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${reportOrder.id} FOR UPDATE`
    acquiredOrderLock()
    await tx.$executeRaw`SELECT pg_sleep(2.0)`
  })
  await orderLockReady
  const auditBeforeLock = await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED', entityId: reportOrder.id } })
  let expiryWaitDenied = false; try { await noteCall(lockExpiry) } catch { expiryWaitDenied = true }
  await orderLock
  ok(expiryWaitDenied && (await db.order.findUnique({ where: { id: reportOrder.id } })).notes === 'Web comment' && auditBeforeLock === await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED', entityId: reportOrder.id } }), 'preview expiring while waiting on Order lock rolls back note and commit audit')
  const previewLockExpiry = await prepareNote('sdk-note-preview-lock-expiry')
  await db.mcpChangePreview.update({ where: { id: previewLockExpiry.previewId }, data: { expiresAt: new Date(Date.now() + 1400) } })
  let acquiredPreviewLock
  const previewLockReady = new Promise(resolve => { acquiredPreviewLock = resolve })
  const previewLock = makeDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "McpChangePreview" WHERE id = ${previewLockExpiry.previewId} FOR UPDATE`
    acquiredPreviewLock()
    await tx.$executeRaw`SELECT pg_sleep(2.0)`
  })
  await previewLockReady
  let previewExpiryDenied = false; try { await noteCall(previewLockExpiry) } catch { previewExpiryDenied = true }
  await previewLock
  ok(previewExpiryDenied && (await db.order.findUnique({ where: { id: reportOrder.id } })).notes === 'Web comment' && auditBeforeLock === await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED', entityId: reportOrder.id } }), 'preview expiring while waiting on preview row lock rolls back note and commit audit')
  const rolePreview = await prepareNote('sdk-note-role')
  await db.user.update({ where: { id: user.id }, data: { role: 'VENDEDOR', permissions: [] } })
  let noteRoleDenied = false; try { await noteCall(rolePreview) } catch { noteRoleDenied = true }
  ok(noteRoleDenied, 'permission downgrade blocks pending note commit')
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  const noteOtherBranch = await db.branch.create({ data: { tenantId: tenant.id, name: 'Note other branch' } })
  const branchPreview = await prepareNote('sdk-note-branch')
  await db.user.update({ where: { id: user.id }, data: { branchId: noteOtherBranch.id } })
  let noteBranchDenied = false; try { await noteCall(branchPreview) } catch { noteBranchDenied = true }
  ok(noteBranchDenied, 'branch change cannot commit inaccessible order comment')
  await db.user.update({ where: { id: user.id }, data: { branchId: branch.id } })
  const revokedNote = await prepareNote('sdk-note-revoked')
  await db.mcpClientGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } })
  let revokedNoteDenied = false; try { await noteCall(revokedNote) } catch { revokedNoteDenied = true }
  ok(revokedNoteDenied && (await db.order.findUnique({ where: { id: reportOrder.id } })).notes === 'Web comment', 'revoked grant cannot commit pending note')
  await db.mcpClientGrant.update({ where: { id: grant.id }, data: { revokedAt: null } })
  const cancelledNoteOrder = await db.order.create({ data: { tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'NOTE-CANCELLED', status: 'CANCELLED', subtotalPyg: 0, totalPyg: 0 } })
  let cancelledNoteDenied = false; try { await noteCall({ ...noteArgs, orderId: cancelledNoteOrder.id, idempotencyKey: 'sdk-note-cancelled' }) } catch { cancelledNoteDenied = true }
  ok(cancelledNoteDenied, 'cancelled sale comment cannot be changed')
  const expiredNote = await prepareNote('sdk-note-expired')
  await db.mcpChangePreview.update({ where: { id: expiredNote.previewId }, data: { expiresAt: new Date(0) } })
  let noteExpiredDenied = false; try { await noteCall(expiredNote) } catch { noteExpiredDenied = true }
  ok(noteExpiredDenied, 'expired note preview cannot commit')
  for (const fields of [{ operation: 'create' }, { notes: '' }, { notes: 'x'.repeat(2001) }, { totalPyg: 1 }, { billingName: 'not a note' }]) {
    let denied = false; try { await noteCall({ ...noteArgs, ...fields, idempotencyKey: 'sdk-note-invalid' }) } catch { denied = true }
    ok(denied, 'sales.write rejects unsupported operation or fields')
  }
  const { consumeMcpQuota } = require('../lib/mcp/rate-limit.ts')
  process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = '3'; process.env.MOBOS_MCP_TENANT_MINUTE_LIMIT = '100'
  const parallelGrant = await Promise.allSettled(Array.from({ length: 20 }, () => consumeMcpQuota(db, 'quota-grant-concurrent', 'quota-tenant-grant')))
  ok(parallelGrant.filter(result => result.status === 'fulfilled').length === 3, 'parallel quota admits exactly grant budget')
  ok(parallelGrant.filter(result => result.status === 'rejected').every(result => result.reason.status === 429), 'parallel grant excess returns safe429')
  process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = '100'; process.env.MOBOS_MCP_TENANT_MINUTE_LIMIT = '5'
  const parallelTenant = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => consumeMcpQuota(db, `quota-grant-${i}`, 'quota-tenant-concurrent')))
  ok(parallelTenant.filter(result => result.status === 'fulfilled').length === 5, 'parallel quota across grants admits exactly tenant budget')
  const attemptsBefore = await db.authAttempt.count({ where: { scope: 'mcp:grant' } })
  let quotaRolledBack = false; try { await consumeMcpQuota(db, 'quota-grant-rollback', 'quota-tenant-concurrent') } catch (error) { quotaRolledBack = error.status === 429 }
  ok(quotaRolledBack && await db.authAttempt.count({ where: { scope: 'mcp:grant' } }) === attemptsBefore, 'tenant quota failure rolls back grant debit')
  await db.authAttempt.deleteMany({ where: { scope: { in: ['mcp:grant', 'mcp:tenant'] } } })
  process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = '1'; process.env.MOBOS_MCP_TENANT_MINUTE_LIMIT = '100'
  const quotaRequest = () => new Request(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1001, method: 'ping' }) })
  ok((await POST(quotaRequest())).status === 200, 'first authenticated HTTP request within quota')
  const quotaResponse = await POST(quotaRequest())
  ok(quotaResponse.status === 429 && Number(quotaResponse.headers.get('retry-after')) > 0, 'HTTP excess returns429 and bounded retry-after')
  const forbiddenChanges = await require('../app/api/mcp/changes/route.ts').POST(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }))
  ok(forbiddenChanges.status === 403, 'direct changes preserves browser origin guard')
  const previewsBeforeQuota = await db.mcpChangePreview.count()
  const changesPost = require('../app/api/mcp/changes/route.ts').POST
  const directBlocked = await changesPost(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'preview', action: 'products.write', idempotencyKey: 'direct-rate-denial', payload: { name: 'blocked', sku: 'blocked' } }) }))
  ok(directBlocked.status === 429 && await db.mcpChangePreview.count() === previewsBeforeQuota, 'direct changes endpoint cannot bypass quota or create preview')
  await db.authAttempt.deleteMany({ where: { scope: { in: ['mcp:grant', 'mcp:tenant'] } } })
  process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT = '10000'; process.env.MOBOS_MCP_TENANT_MINUTE_LIMIT = '100000'
  const badChangesMedia = await changesPost(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { 'content-type': 'application/json-invalid' }, body: '{}' }))
  ok(badChangesMedia.status === 415, 'direct changes rejects malformed JSON media type')
  const oversizedChanges = await changesPost(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, 'content-type': 'application/json; charset=utf-8' }, body: 'x'.repeat(7_100_001) }))
  ok(oversizedChanges.status === 413, 'direct changes accepts allowed origin/media and rejects oversized body before parsing')
  for (const [action, payload] of [['company.write', { name: 'Bad', extra: 'internal-secret' }], ['prices.write', { productId: product.id, pricePyg: Number.MAX_SAFE_INTEGER + 1, expectedPricePyg: 1000 }]]) {
    const rejected = await changesPost(new Request(`${resource}/api/mcp/changes`, { method: 'POST', headers: { authorization: `Bearer ${issued.accessToken}`, origin: resource, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'preview', action, idempotencyKey: 'direct-contract-reject', payload }) }))
    ok(rejected.status === 400 && !(await rejected.text()).includes('internal-secret'), 'direct changes applies closed typed tool contract without echoing input')
  }
  const { pruneMcpImagePreviews } = require('../lib/mcp/preview-retention.ts')
  const imageStored = await db.mcpChangePreview.findUnique({ where: { id: imagePreviewPayload.previewId } })
  ok(!Object.hasOwn(imageStored.payload, 'dataBase64') && imageStored.payloadHash && imageStored.resultId === imageCommit.structuredContent.entityId, 'image commit scrubs bytes atomically while retaining replay hash/result')
  ok(await db.productImage.count({ where: { id: imageStored.resultId, deletedAt: null } }) === 1, 'scrub preserves canonical product photo')
  await pruneMcpImagePreviews(db, { tenantId: tenant.id, limit: 200 })
  let fixtureIndex = 0
  const retentionPreview = (extra = {}) => db.mcpChangePreview.create({ data: { tenantId: tenant.id, userId: user.id, grantId: grant.id, clientId: 'sdk-http', sessionId: session.id, action: 'product_images.write', payloadHash: 'a'.repeat(64), payload: { productId: product.id, dataBase64: png, contentType: 'image/png' }, idempotencyKey: `retention-${++fixtureIndex}`, expiresAt: new Date(Date.now() + 60000), ...extra } })
  const validRetention = await retentionPreview()
  const expiredRetention = await retentionPreview({ expiresAt: new Date(Date.now() - 1000) })
  const retentionForeignTenant = await db.tenant.create({ data: { name: 'Retention other', slug: 'retention-other', email: 'retention-other@example.test' } })
  const retentionForeignUser = await db.user.create({ data: { tenantId: retentionForeignTenant.id, name: 'Other', pinHash: 'unused', role: 'ADMIN' } })
  const foreignRetention = await retentionPreview({ tenantId: retentionForeignTenant.id, userId: retentionForeignUser.id, grantId: null, sessionId: null, expiresAt: new Date(Date.now() - 1000) })
  const timezoneRetentionDb = { $transaction: (callback, options) => db.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'"); return callback(tx) }, options) }
  const firstRetention = await pruneMcpImagePreviews(timezoneRetentionDb, { tenantId: tenant.id, limit: 1 })
  ok(firstRetention.scrubbed === 1 && firstRetention.batchLimit === 1 && !Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: expiredRetention.id } })).payload, 'dataBase64'), 'bounded maintenance scrubs expired preview')
  ok(Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: validRetention.id } })).payload, 'dataBase64') && Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: foreignRetention.id } })).payload, 'dataBase64'), 'maintenance preserves valid proposal and isolates optional tenant scope')
  const revokedGrant = await db.mcpClientGrant.create({ data: { tenantId: tenant.id, userId: user.id, accountId: account.id, clientId: 'sdk-http', redirectUri: 'https://connector.example/revoked-retention', resource, scopes, revokedAt: new Date() } })
  const revokedRetention = await retentionPreview({ grantId: revokedGrant.id })
  await pruneMcpImagePreviews(db, { tenantId: tenant.id })
  ok(!Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: revokedRetention.id } })).payload, 'dataBase64'), 'maintenance scrubs revoked grant before proposal TTL')
  const batchRetention = await Promise.all([1, 2, 3].map(() => retentionPreview({ expiresAt: new Date(Date.now() - 1000) })))
  const boundedCleanup = await pruneMcpImagePreviews(db, { tenantId: tenant.id, limit: 2 })
  ok(boundedCleanup.scrubbed === 2 && (await db.mcpChangePreview.findMany({ where: { id: { in: batchRetention.map(row => row.id) } } })).filter(row => Object.hasOwn(row.payload, 'dataBase64')).length === 1, 'cleanup enforces per-run batch bound without deleting rows')
  await pruneMcpImagePreviews(db, { tenantId: tenant.id })
  const heldRetention = await retentionPreview({ expiresAt: new Date(Date.now() - 1000) })
  let retentionLocked
  const retentionReady = new Promise(resolve => { retentionLocked = resolve })
  const retentionLock = makeDb().$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "McpChangePreview" WHERE id = ${heldRetention.id} FOR UPDATE`; retentionLocked(); await tx.$executeRaw`SELECT pg_sleep(0.7)` })
  await retentionReady
  const skippedCleanup = await pruneMcpImagePreviews(db, { tenantId: tenant.id })
  ok(skippedCleanup.scrubbed === 0 && Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: heldRetention.id } })).payload, 'dataBase64'), 'cleanup skips row locked by another transaction instead of racing')
  await retentionLock
  ok((await pruneMcpImagePreviews(db, { tenantId: tenant.id })).scrubbed === 1, 'later cleanup safely retries previously locked row')
  const raceImageArgs = { ...imageArgs, idempotencyKey: 'retention-commit-race' }
  const raceImagePreview = await client.callTool({ name: 'product_images.write', arguments: raceImageArgs })
  const raceImageId = raceImagePreview.structuredContent.previewId
  const [raceImageResult] = await Promise.all([client.callTool({ name: 'product_images.write', arguments: { ...raceImageArgs, mode: 'commit', previewId: raceImageId } }), pruneMcpImagePreviews(db, { tenantId: tenant.id })])
  const raceReplay = await client.callTool({ name: 'product_images.write', arguments: { ...raceImageArgs, mode: 'commit', previewId: raceImageId } })
  ok(raceImageResult.structuredContent.committed && raceReplay.structuredContent.idempotent && !Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: raceImageId } })).payload, 'dataBase64'), 'valid commit versus cleanup remains replayable without temporary bytes')
  const expiryImageArgs = { ...imageArgs, idempotencyKey: 'retention-expiring-commit' }
  const expiryImagePreview = await client.callTool({ name: 'product_images.write', arguments: expiryImageArgs })
  const expiryImageId = expiryImagePreview.structuredContent.previewId
  await db.mcpChangePreview.update({ where: { id: expiryImageId }, data: { expiresAt: new Date(Date.now() + 350) } })
  let expiryImageLocked
  const expiryImageReady = new Promise(resolve => { expiryImageLocked = resolve })
  const expiryImageLock = makeDb().$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "McpChangePreview" WHERE id = ${expiryImageId} FOR UPDATE`; expiryImageLocked(); await tx.$executeRaw`SELECT pg_sleep(0.9)` })
  await expiryImageReady
  const canonicalBeforeExpiry = await db.productImage.count()
  const expireCommit = client.callTool({ name: 'product_images.write', arguments: { ...expiryImageArgs, mode: 'commit', previewId: expiryImageId } }).then(() => false).catch(() => true)
  await pruneMcpImagePreviews(db, { tenantId: tenant.id })
  await expiryImageLock
  ok(await expireCommit && await db.productImage.count() === canonicalBeforeExpiry, 'commit expiring during cleanup/lock cannot persist canonical image')
  await pruneMcpImagePreviews(db, { tenantId: tenant.id })
  ok(!Object.hasOwn((await db.mcpChangePreview.findUnique({ where: { id: expiryImageId } })).payload, 'dataBase64'), 'expired failed commit bytes cleared by subsequent bounded run')
  const tokenDomains = [...ttlDomains, ['sales.write', { ...noteArgs }]]
  for (const [tokenDomain, tokenArgs] of tokenDomains) for (const loss of ['revoked', 'expired']) {
    const pendingArgs = { ...tokenArgs, ...(tokenDomain === 'products.write' ? { sku: `TOKEN-${loss}` } : {}), ...(tokenDomain === 'customers.write' ? { document: `TOKEN-${loss}` } : {}), idempotencyKey: `retention-token-${tokenDomain}-${loss}` }
    const pending = await client.callTool({ name: tokenDomain, arguments: pendingArgs })
    const pendingId = pending.structuredContent.previewId
    const shortToken = await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource, scopes: [require('../lib/mcp/catalog.ts').scopeForAction(tokenDomain)] })
    const shortTokenId = (await db.mcpAccessToken.findUnique({ where: { tokenHash: oauth.hashMcpSecret(shortToken.accessToken) }, select: { id: true } })).id
    if (loss === 'expired') await db.mcpAccessToken.update({ where: { id: shortTokenId }, data: { expiresAt: new Date(Date.now() + 1500) } })
    let locked, release
    const ready = new Promise(resolve => { locked = resolve })
    const released = new Promise(resolve => { release = resolve })
    const holder = makeDb().$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "McpChangePreview" WHERE id = ${pendingId} FOR UPDATE`; locked(); await released })
    await ready
    const snapshotBeforeTokenLoss = await guardedSnapshot()
    const auditsBeforeTokenLoss = await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED' } })
    const pendingResponse = POST(new Request(`${resource}/api/mcp/streamable`, { method: 'POST', headers: { authorization: `Bearer ${shortToken.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 654, method: 'tools/call', params: { name: tokenDomain, arguments: { ...pendingArgs, mode: 'commit', previewId: pendingId } } }) }))
    let waiter = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%McpChangePreview%'`
      if (rows[0].count > 0) { waiter = true; break }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    ok(waiter, 'token loss regression reaches preview lock after initial bearer validation')
    if (loss === 'revoked') await db.mcpAccessToken.update({ where: { id: shortTokenId }, data: { revokedAt: new Date() } })
    else await db.$executeRaw`SELECT pg_sleep(1.7)`
    release(); await holder
    const pendingResult = await (await pendingResponse).json()
    const pendingRow = await db.mcpChangePreview.findUnique({ where: { id: pendingId } })
    ok(Boolean(pendingResult.error) && await guardedSnapshot() === snapshotBeforeTokenLoss && await db.auditLog.count({ where: { action: 'MCP_CHANGE_COMMITTED' } }) === auditsBeforeTokenLoss && pendingRow.status === 'PREVIEW' && (tokenDomain !== 'product_images.write' || Object.hasOwn(pendingRow.payload, 'dataBase64')), `${tokenDomain} access token ${loss} while blocked rolls back mutation/preview/audit`)
  }
  await db.user.update({ where: { id: user.id }, data: { role: 'GERENTE', branchId: branch.id, permissions: ['products:manage'] } })
  const branchRacePrice = Number((await db.product.findUnique({ where: { id: product.id } })).pricePyg)
  const branchRaceArgs = { mode: 'preview', productId: product.id, pricePyg: branchRacePrice + 17, expectedPricePyg: branchRacePrice, idempotencyKey: 'retention-price-context-race' }
  const branchRace = await client.callTool({ name: 'prices.write', arguments: branchRaceArgs })
  let branchProductLocked, branchProductRelease
  const branchProductReady = new Promise(resolve => { branchProductLocked = resolve })
  const branchProductReleased = new Promise(resolve => { branchProductRelease = resolve })
  const branchProductHolder = makeDb().$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`; branchProductLocked(); await branchProductReleased })
  await branchProductReady
  const branchAuditBefore = await db.auditLog.count({ where: { entityId: product.id } })
  const branchResult = client.callTool({ name: 'prices.write', arguments: { ...branchRaceArgs, mode: 'commit', previewId: branchRace.structuredContent.previewId } }).then(() => false).catch(() => true)
  let branchWaiter = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%Product%'`
    if (rows[0].count > 0) { branchWaiter = true; break }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  ok(branchWaiter, 'price context regression waits on Product with original manager context')
  await db.user.update({ where: { id: user.id }, data: { branchId: noteOtherBranch.id } })
  branchProductRelease(); await branchProductHolder
  ok(await branchResult && Number((await db.product.findUnique({ where: { id: product.id } })).pricePyg) === branchRacePrice && (await db.mcpChangePreview.findUnique({ where: { id: branchRace.structuredContent.previewId } })).status === 'PREVIEW' && await db.auditLog.count({ where: { entityId: product.id } }) === branchAuditBefore, 'manager branch A to B during Product wait rolls back price/preview/audit')
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN', branchId: branch.id, permissions: [] } })
  const { POST: maintenancePost } = require('../app/api/internal/mcp-previews/route.ts')
  const maintenanceRequest = (token, body = '{}') => new Request(`${resource}/api/internal/mcp-previews`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body })
  delete process.env.MOBOS_MAINTENANCE_TOKEN
  ok((await maintenancePost(maintenanceRequest())).status === 503, 'unconfigured retention endpoint fails closed')
  process.env.MOBOS_MAINTENANCE_TOKEN = 'synthetic-maintenance-only'
  ok((await maintenancePost(maintenanceRequest('wrong'))).status === 401, 'retention rejects invalid maintenance token')
  for (const body of ['{"limit":201}', '{"tenantId":"other"}', '[]']) ok((await maintenancePost(maintenanceRequest(process.env.MOBOS_MAINTENANCE_TOKEN, body))).status === 400, 'retention rejects invalid/untrusted options')
  ok((await maintenancePost(maintenanceRequest(process.env.MOBOS_MAINTENANCE_TOKEN, 'x'.repeat(4097)))).status === 413, 'retention body is byte bounded')
  const maintenanceResponse = await maintenancePost(maintenanceRequest(process.env.MOBOS_MAINTENANCE_TOKEN, '{"limit":1}'))
  const maintenanceText = await maintenanceResponse.text()
  ok(maintenanceResponse.status === 200 && !maintenanceText.includes(png) && !maintenanceText.includes('synthetic-maintenance-only'), 'maintenance response returns counts only without bytes/tokens')
  const openSchedule = { timezone: 'America/Asuncion', windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }] }
  await db.user.update({ where: { id: user.id }, data: { accessSchedule: openSchedule } })
  const scheduleTokens = await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['products:read'] })
  ok(Boolean(scheduleTokens.accessToken), 'MCP issuance respects open access schedule')
  const scheduleAccess = await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${scheduleTokens.accessToken}` } }))
  ok(Boolean(scheduleAccess), 'MCP access respects open access schedule')
  await db.user.update({ where: { id: user.id }, data: { accessSchedule: { timezone: 'America/Asuncion', windows: [] } } })
  ok(await requireMcpAccessToken(new Request(`${resource}/api/mcp/streamable`, { headers: { authorization: `Bearer ${scheduleTokens.accessToken}` } })) === null, 'MCP bearer is revoked when app schedule closes')
  let scheduleIssueDenied = false; try { await issueMcpTokens(db, { grantId: grant.id, accountId: account.id, tenantId: tenant.id, sessionId: session.id, userId: user.id, clientId: 'sdk-http', resource: mcpResource(), scopes: ['products:read'] }) } catch { scheduleIssueDenied = true }; ok(scheduleIssueDenied, 'MCP issuance denied outside access schedule')
  let scheduleRefreshDenied = false; try { await rotateMcpRefreshToken(db, scheduleTokens.refreshToken, 'sdk-http') } catch { scheduleRefreshDenied = true }; ok(scheduleRefreshDenied, 'MCP refresh denied outside access schedule')
  await client.close()

    console.log(`MCP SDK HTTP 1.32.1: ${checks} PASS (HTTP aislado; initialize/ping/list/call/notification/Origin/media type)`)
} finally {
  if (httpServer) await new Promise(resolve => httpServer.close(resolve))
  await Promise.all(clients.map(db => db.$disconnect().catch(() => {})))
  if (pgStarted) command('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
}
