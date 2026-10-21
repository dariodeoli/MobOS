import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { MCP_CATALOG } from '../../../../lib/mcp/catalog'
import { requireMcpAccessToken } from '../../../../lib/mcp/oauth'

export const dynamic = 'force-dynamic'

function jsonRpc(id: unknown, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function error(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
function safeJson(value: unknown) { return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v)) }

export async function POST(request: Request) {
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
    const implemented = new Set(['company.read', 'products.read', 'customers.read', 'sales.read', 'reports.read'])
    const tools = MCP_CATALOG.filter(entry => implemented.has(entry.action) && !entry.mutating && auth.scopes.includes(entry.scope)).map(entry => ({ name: entry.action, description: entry.label, inputSchema: { type: 'object', additionalProperties: false, properties: { branchId: { type: 'string' }, q: { type: 'string', maxLength: 120 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } } }))
    return jsonRpc(id, { tools })
  }
  if (body.method !== 'tools/call') return error(id, -32601, 'Método MCP no soportado.')
  const name = body.params?.name
  const args = body.params?.arguments && typeof body.params.arguments === 'object' ? body.params.arguments : {}
  const decision = authorizeMcpAction(name, { tenantId: auth.tenantId, user: auth.user, enabledModules: modules, grantedScopes: auth.scopes, requestedBranchId: typeof args.branchId === 'string' ? args.branchId : null })
  if (!decision.allowed) return error(id, -32003, decision.reason, { code: decision.code })
  if (decision.entry.mutating) return error(id, -32004, 'Esta versión del transporte sólo habilita lecturas.')
  const limit = typeof args.limit === 'number' && Number.isInteger(args.limit) ? Math.min(50, Math.max(1, args.limit)) : 20
  let data: unknown
  if (name === 'company.read') data = { id: auth.tenantId, name: tenant.name, slug: tenant.slug, email: tenant.email }
  else if (name === 'products.read') data = await prisma.product.findMany({ where: { tenantId: auth.tenantId, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}), ...(typeof args.q === 'string' && args.q.trim() ? { OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' } }, { sku: { contains: args.q.trim(), mode: 'insensitive' } }] } : {}) }, select: { id: true, sku: true, name: true, category: true, model: true, color: true, capacity: true, pricePyg: true, stock: true, branchId: true, isActive: true }, orderBy: { name: 'asc' }, take: limit })
  else if (name === 'customers.read') data = await prisma.customer.findMany({ where: { tenantId: auth.tenantId, ...(typeof args.q === 'string' && args.q.trim() ? { OR: [{ name: { contains: args.q.trim(), mode: 'insensitive' } }, { document: { contains: args.q.trim(), mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, document: true, phone: true, email: true, blocked: true }, orderBy: { name: 'asc' }, take: limit })
  else if (name === 'sales.read') {
    const scopeWhere = decision.dataScope === 'own' ? { sellerId: auth.user.id } : decision.dataScope === 'branch' && decision.branchId ? { branchId: decision.branchId } : {}
    data = await prisma.order.findMany({ where: { tenantId: auth.tenantId, archivedAt: null, ...scopeWhere }, select: { id: true, orderNumber: true, status: true, fulfillmentStatus: true, totalPyg: true, createdAt: true, branchId: true, sellerId: true, customer: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: limit })
  } else if (name === 'reports.read') {
    const [orders, paid] = await Promise.all([prisma.order.aggregate({ where: { tenantId: auth.tenantId, status: { not: 'CANCELLED' }, archivedAt: null }, _count: { _all: true }, _sum: { totalPyg: true } }), prisma.payment.aggregate({ where: { tenantId: auth.tenantId, status: 'CONFIRMED' }, _sum: { amountPyg: true } })])
    data = { orders: orders._count._all, totalPyg: orders._sum.totalPyg ?? 0, confirmedPaymentsPyg: paid._sum.amountPyg ?? 0 }
  } else return error(id, -32005, 'La lectura aún no está implementada para esta capacidad.')
  return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(safeJson(data)) }], structuredContent: { items: safeJson(data) } })
}
