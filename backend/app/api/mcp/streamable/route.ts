import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { MCP_CATALOG } from '../../../../lib/mcp/catalog'
import { requireMcpAccessToken } from '../../../../lib/mcp/oauth'
import { POST as priceChange } from '../changes/route'
import { aggregateReport, dayBounds, parseReportQuery, MAX_REPORT_ORDERS } from '../../../../lib/reporting'
import { numero } from '../../../../lib/montos'

export const dynamic = 'force-dynamic'

function originAllowed(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  let originUrl: URL
  try { originUrl = new URL(origin) } catch { return false }
  const configured = (process.env.MOBOS_MCP_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (configured.includes(originUrl.origin)) return true
  try { return originUrl.origin === new URL(request.url).origin } catch { return false }
}

function jsonRpc(id: unknown, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function error(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
function safeJson(value: unknown) { return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v)) }
function decodeCursor(value: unknown) { if (typeof value !== 'string' || value.length > 300) return null; try { const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); return decoded && typeof decoded === 'object' ? decoded : null } catch { return null } }
function encodeCursor(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url') }

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403 })
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 })
  const auth = await requireMcpAccessToken(request)
  if (!auth) return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="/.well-known/oauth-protected-resource"' } })
  let body: any
  try { body = await request.json() } catch { return error(null, -32700, 'JSON inválido.') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0' || typeof body?.method !== 'string') return error(id, -32600, 'Solicitud JSON-RPC inválida.')
  if (body.method === 'initialize') return jsonRpc(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'MobOS MCP', version: '1' } })
  if (body.method === 'notifications/initialized') return new NextResponse(null, { status: 202 })
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { settings: true, name: true, slug: true, email: true } })
  if (!tenant) return error(id, -32001, 'Empresa no disponible.')
  const modules = moduleStoreFrom(tenant.settings).modules
  if (body.method === 'tools/list') {
    const implemented = new Set(['company.read', 'products.read', 'customers.read', 'sales.read', 'reports.read', 'prices.write', 'product_images.write'])
    const tools = MCP_CATALOG.filter(entry => implemented.has(entry.action) && (entry.action === 'prices.write' || entry.action === 'product_images.write' || !entry.mutating) && auth.scopes.includes(entry.scope)).map(entry => ({ name: entry.action, description: entry.label, inputSchema: entry.action === 'prices.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, productId: { type: 'string' }, pricePyg: { type: 'integer', minimum: 0 }, expectedPricePyg: { type: 'integer', minimum: 0 }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : entry.action === 'product_images.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'productId', 'dataBase64', 'contentType', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, productId: { type: 'string' }, branchId: { type: 'string' }, variantKey: { type: 'string', maxLength: 100 }, dataBase64: { type: 'string', minLength: 16, maxLength: 7000000 }, contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : { type: 'object', additionalProperties: false, properties: { branchId: { type: 'string' }, q: { type: 'string', maxLength: 120 }, cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50 }, from: { type: 'string' }, to: { type: 'string' }, groupBy: { type: 'string' }, tzOffset: { type: 'integer' }, paymentsBy: { type: 'string' } } } }))
    return jsonRpc(id, { tools })
  }
  if (body.method !== 'tools/call') return error(id, -32601, 'Método MCP no soportado.')
  const name = body.params?.name
  const args = body.params?.arguments && typeof body.params.arguments === 'object' ? body.params.arguments : {}
  const decision = authorizeMcpAction(name, { tenantId: auth.tenantId, user: auth.user, enabledModules: modules, grantedScopes: auth.scopes, requestedBranchId: typeof args.branchId === 'string' ? args.branchId : null })
  if (!decision.allowed) return error(id, -32003, decision.reason, { code: decision.code })
  if (name === 'prices.write' || name === 'product_images.write') {
    const payload = name === 'product_images.write'
      ? { productId: args.productId, branchId: args.branchId, variantKey: args.variantKey, dataBase64: args.dataBase64, contentType: args.contentType }
      : { productId: args.productId, pricePyg: args.pricePyg, expectedPricePyg: args.expectedPricePyg }
    const forwarded = new Request(new URL('/api/mcp/changes', request.url), { method: 'POST', headers: { authorization: request.headers.get('authorization') ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ ...args, action: name, payload, idempotencyKey: args.idempotencyKey }) })
    const result = await priceChange(forwarded)
    const responsePayload = await result.json().catch(() => ({ error: 'respuesta_invalida' }))
    if (!result.ok) return error(id, -32004, typeof responsePayload.error === 'string' ? responsePayload.error : 'No se pudo aplicar el cambio.', responsePayload)
    return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(safeJson(responsePayload)) }], structuredContent: responsePayload })
  }
  if (decision.entry.mutating) return error(id, -32004, 'Esta versión del transporte sólo habilita lecturas.')
  const limit = typeof args.limit === 'number' && Number.isInteger(args.limit) ? Math.min(50, Math.max(1, args.limit)) : 20
  const cursor = decodeCursor(args.cursor)
  let data: unknown
  if (name === 'company.read') data = { id: auth.tenantId, name: tenant.name, slug: tenant.slug, email: tenant.email }
  else if (name === 'products.read') { const rows = await prisma.product.findMany({ where: { AND: [{ tenantId: auth.tenantId }, ...(decision.branchId ? [{ OR: [{ branchId: decision.branchId }, { branchId: null }] }] : []), ...(typeof args.q === 'string' && args.q.trim() ? [{ OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' as const } }, { sku: { contains: args.q.trim(), mode: 'insensitive' as const } }] }] : []), ...(cursor?.name && cursor?.id ? [{ OR: [{ name: { gt: String(cursor.name) } }, { name: String(cursor.name), id: { gt: String(cursor.id) } }] }] : [])] }, select: { id: true, sku: true, name: true, category: true, model: true, color: true, capacity: true, pricePyg: true, stock: true, branchId: true, isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ name: items[items.length - 1].name, id: items[items.length - 1].id }) : null } }
  else if (name === 'customers.read') { const rows = await prisma.customer.findMany({ where: { AND: [{ tenantId: auth.tenantId }, ...(typeof args.q === 'string' && args.q.trim() ? [{ OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' as const } }, { document: { contains: args.q.trim(), mode: 'insensitive' as const } }] }] : []), ...(cursor?.name && cursor?.id ? [{ OR: [{ name: { gt: String(cursor.name) } }, { name: String(cursor.name), id: { gt: String(cursor.id) } }] }] : [])] }, select: { id: true, name: true, document: true, phone: true, email: true, blocked: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ name: items[items.length - 1].name, id: items[items.length - 1].id }) : null } }
  else if (name === 'sales.read') {
    const scopeWhere = decision.dataScope === 'own' ? { sellerId: auth.user.id } : decision.dataScope === 'branch' && decision.branchId ? { branchId: decision.branchId } : {}
    const rows = await prisma.order.findMany({ where: { AND: [{ tenantId: auth.tenantId, archivedAt: null, ...scopeWhere }, ...(cursor?.createdAt && cursor?.id ? [{ OR: [{ createdAt: { lt: new Date(String(cursor.createdAt)) } }, { createdAt: new Date(String(cursor.createdAt)), id: { lt: String(cursor.id) } }] }] : [])] }, select: { id: true, orderNumber: true, status: true, fulfillmentStatus: true, totalPyg: true, createdAt: true, branchId: true, sellerId: true, customer: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows; data = { items, nextCursor: hasMore ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id }) : null }
  } else if (name === 'reports.read') {
    const params = new URLSearchParams(); for (const key of ['from', 'to', 'groupBy', 'tzOffset', 'paymentsBy']) if (args[key] !== undefined) params.set(key, String(args[key])); const parsed = parseReportQuery(params); if (!parsed.ok) return error(id, -32602, parsed.error); const { start, end } = dayBounds(parsed.value.from, parsed.value.to, parsed.value.offsetMinutes)
    const orders = await prisma.order.findMany({ where: { tenantId: auth.tenantId, createdAt: { gte: start, lt: end }, archivedAt: null }, include: { branch: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true, role: true } }, items: { select: { productId: true, description: true, quantity: true, unitCostPyg: true, totalPyg: true, product: { select: { name: true, category: true } } } }, payments: { select: { id: true, reversalOfId: true, status: true, amountPyg: true, method: true, accountSnapshot: true } } }, orderBy: { createdAt: 'asc' }, take: MAX_REPORT_ORDERS + 1 })
    const truncated = orders.length > MAX_REPORT_ORDERS; const used = truncated ? orders.slice(0, MAX_REPORT_ORDERS) : orders
    const report = aggregateReport(used.map((order: any) => ({ id: order.id, status: order.status, subtotalPyg: order.subtotalPyg, discountPyg: order.discountPyg, deliveryPyg: order.deliveryPyg, totalPyg: order.totalPyg, sellerId: order.sellerId, sellerName: order.seller?.name ?? null, customerId: order.customerId, customerName: order.customer?.name ?? null, branchId: order.branchId, branchName: order.branch?.name ?? null, createdAt: order.createdAt, items: order.items.map((item: any) => ({ productId: item.productId, description: item.description, productName: item.product?.name ?? null, category: item.product?.category ?? null, quantity: item.quantity, unitCostPyg: item.unitCostPyg, totalPyg: item.totalPyg })), payments: order.payments.map((payment: any) => ({ id: payment.id, reversalOfId: payment.reversalOfId, status: payment.status, amountPyg: payment.amountPyg, method: payment.method, accountName: null, accountId: null, processor: null })) })), { groupBy: parsed.value.groupBy, offsetMinutes: parsed.value.offsetMinutes, paymentsBy: parsed.value.paymentsBy }); data = { ...report, from: parsed.value.from, to: parsed.value.to, groupBy: parsed.value.groupBy, offsetMinutes: parsed.value.offsetMinutes, truncated }
  } else return error(id, -32005, 'La lectura aún no está implementada para esta capacidad.')
  return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(safeJson(data)) }], structuredContent: { items: safeJson(data) } })
}
