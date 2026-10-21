import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { prisma } from '../../../../lib/prisma'
import { findMcpClient, hashMcpSecret } from '../../../../lib/mcp/oauth'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const raw = await request.text()
  const body = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')
    ? Object.fromEntries(new URLSearchParams(raw).entries()) as Record<string, unknown>
    : (() => { try { return JSON.parse(raw || '{}') as Record<string, unknown> } catch { return {} } })()
  const client = findMcpClient(body.client_id)
  if (!client || typeof body.token !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const hash = hashMcpSecret(body.token)
  const row = await prisma.mcpAccessToken.findFirst({ where: { clientId: client.clientId, OR: [{ tokenHash: hash }, { refreshTokenHash: hash }], revokedAt: null }, select: { id: true, tenantId: true } })
  if (row) { await prisma.mcpAccessToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }); await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'MCP_TOKEN_REVOKED', entity: 'McpAccessToken', entityId: row.id, metadata: { clientId: client.clientId } } }) }
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
