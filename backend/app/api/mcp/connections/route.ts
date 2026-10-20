import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { sameOrigin } from '../../../../lib/google-oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origen_no_valido' }, { status: 403 })
  const session = await requireSession(request)
  if (!session?.accountId) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const grants = await prisma.mcpClientGrant.findMany({ where: { accountId: session.accountId, tenantId: session.user.tenantId, userId: session.user.id }, select: { id: true, clientId: true, redirectUri: true, scopes: true, revokedAt: true, createdAt: true, updatedAt: true, tokens: { where: { revokedAt: null }, orderBy: { lastUsedAt: 'desc' }, take: 1, select: { lastUsedAt: true, createdAt: true } } }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ connections: grants.map(grant => ({ id: grant.id, clientId: grant.clientId, redirectUri: grant.redirectUri, scopes: grant.scopes, revokedAt: grant.revokedAt, createdAt: grant.createdAt, updatedAt: grant.updatedAt, lastUsedAt: grant.tokens[0]?.lastUsedAt ?? null })) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origen_no_valido' }, { status: 403 })
  const session = await requireSession(request)
  if (!session?.accountId) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }
  const id = body && typeof body === 'object' && typeof (body as Record<string, unknown>).id === 'string' ? (body as Record<string, string>).id : ''
  if (!id || id.length > 100) return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  const grant = await prisma.mcpClientGrant.findFirst({ where: { id, accountId: session.accountId, tenantId: session.user.tenantId, userId: session.user.id, revokedAt: null }, select: { id: true, clientId: true } })
  if (!grant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const now = new Date()
  await prisma.$transaction(async tx => {
    await tx.mcpClientGrant.update({ where: { id: grant.id }, data: { revokedAt: now } })
    await tx.mcpAccessToken.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: now } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'MCP_CONNECTION_REVOKED', entity: 'McpClientGrant', entityId: grant.id, metadata: { clientId: grant.clientId } } })
  })
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
