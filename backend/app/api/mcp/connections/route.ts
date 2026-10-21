import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { sameOrigin } from '../../../../lib/google-oauth'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { MCP_CATALOG, IMPLEMENTED_MCP_ACTIONS } from '../../../../lib/mcp/catalog'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { configuredMcpClients, mcpIssuer, mcpResource } from '../../../../lib/mcp/oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origen_no_valido' }, { status: 403 })
  const session = await requireSession(request)
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  const modules = moduleStoreFrom(tenant?.settings).modules
  const implemented = new Set<string>(IMPLEMENTED_MCP_ACTIONS)
  const ownerCanCreate = Boolean(session.accountId && session.user.role === 'ADMIN' && await prisma.tenantMembership.findFirst({ where: { accountId: session.accountId, tenantId: session.user.tenantId, userId: session.user.id, role: 'OWNER', revokedAt: null }, select: { id: true } }))
  const capabilities = MCP_CATALOG.filter(entry => implemented.has(entry.action) && (entry.action !== 'company.create' || ownerCanCreate) && authorizeMcpAction(entry.action, { tenantId: session.user.tenantId, user: session.user, enabledModules: modules, grantedScopes: [entry.scope] }).allowed).map(entry => ({ action: entry.action, scope: entry.scope, label: entry.label }))
  const issuer = (() => { try { return mcpIssuer() } catch { return null } })()
  const resource = (() => { try { return mcpResource() } catch { return null } })()
  const grants = await prisma.mcpClientGrant.findMany({ where: { tenantId: session.user.tenantId, userId: session.user.id, ...(session.accountId ? { accountId: session.accountId } : { accountId: null }) }, select: { id: true, clientId: true, redirectUri: true, scopes: true, revokedAt: true, createdAt: true, updatedAt: true, tokens: { where: { revokedAt: null }, orderBy: { lastUsedAt: 'desc' }, take: 1, select: { lastUsedAt: true, createdAt: true } } }, orderBy: { updatedAt: 'desc' } })
  const providers = configuredMcpClients().map(client => ({ id: client.clientId, name: client.name, oauth: true }))
  return NextResponse.json({ connections: grants.map(grant => ({ id: grant.id, clientId: grant.clientId, redirectUri: grant.redirectUri, scopes: grant.scopes, revokedAt: grant.revokedAt, createdAt: grant.createdAt, updatedAt: grant.updatedAt, lastUsedAt: grant.tokens[0]?.lastUsedAt ?? null })), oauthConfigured: Boolean(issuer && resource && providers.length), endpoint: resource ? `${resource}/api/mcp/streamable` : null, capabilities, providers }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origen_no_valido' }, { status: 403 })
  const session = await requireSession(request)
  if (!session) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }
  const id = body && typeof body === 'object' && typeof (body as Record<string, unknown>).id === 'string' ? (body as Record<string, string>).id : ''
  if (!id || id.length > 100) return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  const grant = await prisma.mcpClientGrant.findFirst({ where: { id, tenantId: session.user.tenantId, userId: session.user.id, ...(session.accountId ? { accountId: session.accountId } : { accountId: null }), revokedAt: null }, select: { id: true, clientId: true } })
  if (!grant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const now = new Date()
  await prisma.$transaction(async tx => {
    await tx.mcpClientGrant.update({ where: { id: grant.id }, data: { revokedAt: now } })
    await tx.mcpAccessToken.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: now } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'MCP_CONNECTION_REVOKED', entity: 'McpClientGrant', entityId: grant.id, metadata: { clientId: grant.clientId } } })
  })
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
