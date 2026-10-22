// modulo-guard-exento: guarda propia con la empresa del token MCP (ver ia-conectores en el handler)
import { mcpOriginAllowed, mcpJsonRequest } from '../../../../lib/mcp/transport'
import { mcpAccessFailure } from '../../../../lib/mcp/rate-limit'
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { moduloApagadoMensaje } from '../../../../lib/modulos-guard'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { MCP_CATALOG, IMPLEMENTED_MCP_ACTIONS } from '../../../../lib/mcp/catalog'
import { requireMcpAccessToken, mcpResource } from '../../../../lib/mcp/oauth'
import { POST as priceChange } from '../changes/route'
import { aggregateReport, dayBounds, parseReportQuery, MAX_REPORT_ORDERS } from '../../../../lib/reporting'
import { toolInputSchema, invalidToolArguments, decodeToolCursor } from '../../../../lib/mcp/tool-contracts'
import { readTenantCompanyProfile } from '../../../../lib/tenant-company-profile'
import { prepareCompanyCreation, CompanyCreationPreparationError } from '../../../../lib/company-creation-bridge'
import { readBoundedBody } from '../../../../lib/mcp/request-body'
import { listPriceLists, readPriceList, PriceListServiceError } from '../../../../lib/price-list-service'

export const dynamic = 'force-dynamic'

function jsonRpc(id: unknown, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function error(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
function safeJson(value: unknown) { return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v)) }
function encodeCursor(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
const MAX_JSON_BYTES = 7_100_000

export async function POST(request: Request) {
  if (!mcpOriginAllowed(request)) return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403 })
  if (!mcpJsonRequest(request)) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 })
  let auth: Awaited<ReturnType<typeof requireMcpAccessToken>>
  try { auth = await requireMcpAccessToken(request) } catch (error) { return mcpAccessFailure(error) }
  if (!auth) { let metadata = '/.well-known/oauth-protected-resource'; try { metadata = new URL('/.well-known/oauth-protected-resource', `${mcpResource()}/`).href } catch {} return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${metadata}"` } }) }
  let body: any
  try { const raw = await readBoundedBody(request, MAX_JSON_BYTES); if (raw === null) return NextResponse.json({ error: 'request_too_large' }, { status: 413 }); body = JSON.parse(raw) } catch { return error(null, -32700, 'JSON inválido.') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0' || typeof body?.method !== 'string') return error(id, -32600, 'Solicitud JSON-RPC inválida.')
  if (body.method === 'initialize') return jsonRpc(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'MobOS MCP', version: '1' } })
  if (body.method === 'ping') return jsonRpc(id, {})
  if (body.method === 'notifications/initialized') return new NextResponse(null, { status: 202 })
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { settings: true, name: true, slug: true, email: true } })
  if (!tenant) return error(id, -32001, 'Empresa no disponible.')
  const modules = moduleStoreFrom(tenant.settings).modules
  if (body.method === 'tools/list') {
    const implemented = new Set<string>(IMPLEMENTED_MCP_ACTIONS)
    const ownerCanCreate = Boolean(auth.accountId && auth.user.role === 'ADMIN' && await prisma.tenantMembership.findFirst({ where: { accountId: auth.accountId, tenantId: auth.tenantId, userId: auth.user.id, role: 'OWNER', revokedAt: null }, select: { id: true } }))
    const tools = MCP_CATALOG.filter(entry => implemented.has(entry.action) && (entry.action !== 'company.create' || ownerCanCreate) && (entry.action === 'products.write' || entry.action === 'prices.write' || entry.action === 'price_lists.write' || entry.action === 'product_images.write' || entry.action === 'customers.write' || entry.action === 'company.write' || entry.action === 'company.create' || entry.action === 'sales.write' || !entry.mutating) && auth.scopes.includes(entry.scope)).filter(entry => authorizeMcpAction(entry.action, { tenantId: auth.tenantId, user: auth.user, enabledModules: modules, grantedScopes: auth.scopes, requestedBranchId: null }).allowed).map(entry => ({ name: entry.action, description: entry.label, inputSchema: toolInputSchema(entry.action) }))
    return jsonRpc(id, { tools })
  }
  if (body.method !== 'tools/call') return error(id, -32601, 'Método MCP no soportado.')
  if (!body.params || typeof body.params !== 'object' || Array.isArray(body.params)) return error(id, -32602, 'params inválido.')
  const name = body.params.name
  if (typeof name !== 'string') return error(id, -32602, 'name inválido.')
  const rawArgs = body.params.arguments
  if (rawArgs !== undefined && (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))) return error(id, -32602, 'arguments debe ser un objeto.')
  const args = (rawArgs ?? {}) as Record<string, unknown>
  const argumentError = invalidToolArguments(name, args)
  if (argumentError) return error(id, -32602, argumentError)
  // Con el módulo apagado el conector solo lee: las herramientas que escriben dan 403.
  if (modules['ia-conectores']?.enabled !== true && MCP_CATALOG.find(entry => entry.action === name)?.mutating) return error(id, -32003, moduloApagadoMensaje('ia-conectores'), { code: 'MODULE_DISABLED' })
  const decision = authorizeMcpAction(name, { tenantId: auth.tenantId, user: auth.user, enabledModules: modules, grantedScopes: auth.scopes, requestedBranchId: typeof args.branchId === 'string' ? args.branchId : null })
  if (!decision.allowed) return error(id, -32003, decision.reason, { code: decision.code })
  if (name === 'company.create') {
    try {
      const prepared = await prepareCompanyCreation({ db: prisma as any, accountId: auth.accountId, tenantId: auth.tenantId, userId: auth.user.id, companyName: args.companyName })
      return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(prepared) }], structuredContent: prepared })
    } catch (caught) {
      if (caught instanceof CompanyCreationPreparationError) return error(id, -32003, caught.message, { code: caught.code })
      return error(id, -32003, 'No se pudo preparar el alta de empresa.', { code: 'COMPANY_CREATE_FORBIDDEN' })
    }
  }
  if (name === 'sales.write' || name === 'products.write' || name === 'prices.write' || name === 'price_lists.write' || name === 'product_images.write' || name === 'customers.write' || name === 'company.write') {
    const payload = name === 'sales.write' ? { operation: args.operation, orderId: args.orderId, notes: args.notes } : name === 'products.write'
      ? { operation: args.operation, productId: args.productId, branchId: args.branchId, name: args.name, sku: args.sku, category: args.category, model: args.model, color: args.color, capacity: args.capacity, pricePyg: args.pricePyg }
      : name === 'product_images.write'
        ? { productId: args.productId, branchId: args.branchId, variantKey: args.variantKey, dataBase64: args.dataBase64, contentType: args.contentType }
        : name === 'customers.write'
        ? { operation: args.operation, customerId: args.customerId, name: args.name, firstName: args.firstName, secondName: args.secondName, document: args.document, phone: args.phone, email: args.email, addresses: args.addresses }
        : name === 'company.write'
          ? { name: args.name, email: args.email, address: args.address, city: args.city, department: args.department, phone: args.phone, ruc: args.ruc }
          : name === 'price_lists.write'
          ? { operation: args.operation, priceListId: args.priceListId, name: args.name, isActive: args.isActive, items: args.items, replaceItems: args.replaceItems }
          : { productId: args.productId, pricePyg: args.pricePyg, expectedPricePyg: args.expectedPricePyg }
    const forwarded = new Request(new URL('/api/mcp/changes', request.url), { method: 'POST', headers: { authorization: request.headers.get('authorization') ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ ...args, action: name, payload, idempotencyKey: args.idempotencyKey }) })
    const result = await priceChange(forwarded)
    const responsePayload = await result.json().catch(() => ({ error: 'respuesta_invalida' }))
    if (!result.ok) return error(id, -32004, typeof responsePayload.error === 'string' ? responsePayload.error : 'No se pudo aplicar el cambio.', responsePayload)
    return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(safeJson(responsePayload)) }], structuredContent: responsePayload })
  }
  if (decision.entry.mutating) return error(id, -32004, 'Esta versión del transporte sólo habilita lecturas.')
  const limit = args.limit === undefined ? 20 : args.limit as number
  const cursor = decodeToolCursor(name, args.cursor)
  if (args.cursor !== undefined && !cursor) return error(id, -32602, 'Cursor inválido.')
  let data: unknown
  if (name === 'company.read') data = await readTenantCompanyProfile({ tenantId: auth.tenantId, actorUserId: auth.user.id })
  else if (name === 'price_lists.read') { try { const actor = { id: auth.user.id, tenantId: auth.tenantId, role: auth.user.role, permissions: auth.user.permissions }; if (args.listId) data = await readPriceList(prisma, actor, args.listId as string); else { const page = await listPriceLists(prisma, actor, { q: args.q as string | undefined, cursor: cursor?.id as string | undefined, limit }); data = { ...page, nextCursor: page.nextCursor ? encodeCursor({ id: page.nextCursor }) : null } } } catch (caught) { if (caught instanceof PriceListServiceError) return error(id, caught.code === 'not_found' ? -32004 : -32003, caught.message, { code: caught.code }); throw caught } }
  else if (name === 'products.read') { const rows = await prisma.product.findMany({ where: { AND: [{ tenantId: auth.tenantId }, ...(decision.branchId ? [{ OR: [{ branchId: decision.branchId }, { branchId: null }] }] : []), ...(typeof args.q === 'string' && args.q.trim() ? [{ OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' as const } }, { sku: { contains: args.q.trim(), mode: 'insensitive' as const } }] }] : []), ...(cursor?.name && cursor?.id ? [{ OR: [{ name: { gt: String(cursor.name) } }, { name: String(cursor.name), id: { gt: String(cursor.id) } }] }] : [])] }, select: { id: true, sku: true, name: true, category: true, model: true, color: true, capacity: true, pricePyg: true, stock: true, branchId: true, isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ name: items[items.length - 1].name, id: items[items.length - 1].id }) : null } }
  else if (name === 'customers.read') { const rows = await prisma.customer.findMany({ where: { AND: [{ tenantId: auth.tenantId }, ...(typeof args.q === 'string' && args.q.trim() ? [{ OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' as const } }, { document: { contains: args.q.trim(), mode: 'insensitive' as const } }] }] : []), ...(cursor?.name && cursor?.id ? [{ OR: [{ name: { gt: String(cursor.name) } }, { name: String(cursor.name), id: { gt: String(cursor.id) } }] }] : [])] }, select: { id: true, name: true, document: true, phone: true, email: true, blocked: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ name: items[items.length - 1].name, id: items[items.length - 1].id }) : null } }
  else if (name === 'sales.read') {
    const scopeWhere = decision.dataScope === 'own' ? { sellerId: auth.user.id, ...(decision.branchId ? { branchId: decision.branchId } : {}) } : decision.branchId ? { branchId: decision.branchId } : decision.dataScope === 'branch' ? { branchId: auth.user.branchId ?? '__none__' } : {}
    const rows = await prisma.order.findMany({ where: { AND: [{ tenantId: auth.tenantId, archivedAt: null, ...scopeWhere }, ...(cursor?.createdAt && cursor?.id ? [{ OR: [{ createdAt: { lt: new Date(String(cursor.createdAt)) } }, { createdAt: new Date(String(cursor.createdAt)), id: { lt: String(cursor.id) } }] }] : [])] }, select: { id: true, orderNumber: true, status: true, fulfillmentStatus: true, totalPyg: true, createdAt: true, branchId: true, sellerId: true, customer: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id }) : null }
  } else if (name === 'reports.read') {
    let reportBranchId: string | null = null
    if (args.branchId !== undefined) {
      const branch = await prisma.branch.findFirst({ where: { id: args.branchId as string, tenantId: auth.tenantId, isActive: true }, select: { id: true } })
      if (!branch) return error(id, -32602, 'Sucursal no disponible para esta sesión.')
      reportBranchId = branch.id
    }
    const params = new URLSearchParams(); for (const key of ['from', 'to', 'groupBy', 'tzOffset', 'paymentsBy']) if (args[key] !== undefined) params.set(key, String(args[key])); const parsed = parseReportQuery(params); if (!parsed.ok) return error(id, -32602, parsed.error); const { start, end } = dayBounds(parsed.value.from, parsed.value.to, parsed.value.offsetMinutes)
    const orders = await prisma.order.findMany({ where: { tenantId: auth.tenantId, ...(reportBranchId ? { branchId: reportBranchId } : {}), createdAt: { gte: start, lt: end } }, include: { branch: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true, role: true } }, items: { select: { productId: true, description: true, quantity: true, unitCostPyg: true, totalPyg: true, product: { select: { name: true, category: true } } } }, payments: { select: { id: true, reversalOfId: true, status: true, amountPyg: true, method: true, accountSnapshot: true } } }, orderBy: { createdAt: 'asc' }, take: MAX_REPORT_ORDERS + 1 })
    const truncated = orders.length > MAX_REPORT_ORDERS; const used = truncated ? orders.slice(0, MAX_REPORT_ORDERS) : orders
    const report = aggregateReport(used.map((order: any) => ({ id: order.id, status: order.status, subtotalPyg: order.subtotalPyg, discountPyg: order.discountPyg, deliveryPyg: order.deliveryPyg, totalPyg: order.totalPyg, sellerId: order.sellerId, sellerName: order.seller?.name ?? null, customerId: order.customerId, customerName: order.customer?.name ?? null, branchId: order.branchId, branchName: order.branch?.name ?? null, createdAt: order.createdAt, items: order.items.map((item: any) => ({ productId: item.productId, description: item.description, productName: item.product?.name ?? null, category: item.product?.category ?? null, quantity: item.quantity, unitCostPyg: item.unitCostPyg, totalPyg: item.totalPyg })), payments: order.payments.map((payment: any) => { const snapshot = payment.accountSnapshot && typeof payment.accountSnapshot === 'object' && !Array.isArray(payment.accountSnapshot) ? payment.accountSnapshot : {}; return { id: payment.id, reversalOfId: payment.reversalOfId, status: payment.status, amountPyg: payment.amountPyg, method: payment.method, accountName: typeof snapshot.name === 'string' ? snapshot.name : null, accountId: typeof snapshot.id === 'string' ? snapshot.id : null, processor: typeof snapshot.processor === 'string' ? snapshot.processor : null } }) })), { groupBy: parsed.value.groupBy, offsetMinutes: parsed.value.offsetMinutes, paymentsBy: parsed.value.paymentsBy }); data = { ...report, from: parsed.value.from, to: parsed.value.to, groupBy: parsed.value.groupBy, offsetMinutes: parsed.value.offsetMinutes, truncated }
  } else return error(id, -32005, 'La lectura aún no está implementada para esta capacidad.')
  return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(safeJson(data)) }], structuredContent: safeJson(data) })
}
