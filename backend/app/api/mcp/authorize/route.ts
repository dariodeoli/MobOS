import { NextResponse } from 'next/server'
import { requireSession } from '../../../../lib/auth'
import { sameOrigin } from '../../../../lib/google-oauth'
import { prisma } from '../../../../lib/prisma'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { actionForScope } from '../../../../lib/mcp/catalog'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { assertScopeActions, configuredMcpClients, issueMcpAuthorizationCode, findMcpClient, normalizeMcpScopes, McpOAuthError } from '../../../../lib/mcp/oauth'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    if (request.headers.has('authorization') || !sameOrigin(request)) throw new McpOAuthError('invalid_request', 'La autorización MCP requiere la sesión web de MobOS.', 401)
    const session = await requireSession(request)
    if (!session?.accountId) throw new McpOAuthError('login_required', 'Iniciá sesión en MobOS para autorizar el conector.', 401)
    const body = await request.json() as Record<string, unknown>
    const client = findMcpClient(body.client_id, body.redirect_uri)
    if (!client) throw new McpOAuthError('invalid_client', 'Cliente o redirect URI no registrado.', 400)
    const scopes = normalizeMcpScopes(body.scope)
    assertScopeActions(scopes)
    const redirectUri = body.redirect_uri as string
    const challenge = typeof body.code_challenge === 'string' ? body.code_challenge : ''
    if (!/^S256$/.test(String(body.code_challenge_method)) || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) throw new McpOAuthError('invalid_request', 'PKCE S256 es obligatorio.', 400)
    const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true, archivedAt: true } })
    if (!tenant || tenant.archivedAt) throw new McpOAuthError('access_denied', 'La empresa no está disponible.', 403)
    const enabledModules = moduleStoreFrom(tenant.settings).modules
    for (const scope of scopes) {
      const action = actionForScope(scope)
      if (!action || !authorizeMcpAction(action, { tenantId: session.user.tenantId, user: session.user, enabledModules, grantedScopes: scopes }).allowed) throw new McpOAuthError('access_denied', `No tenés permiso para autorizar ${scope}.`, 403)
    }
    const grant = await prisma.mcpClientGrant.upsert({ where: { accountId_tenantId_clientId_redirectUri: { accountId: session.accountId, tenantId: session.user.tenantId, clientId: client.clientId, redirectUri } }, create: { accountId: session.accountId, tenantId: session.user.tenantId, clientId: client.clientId, redirectUri, scopes: [...scopes] }, update: { scopes: [...scopes], revokedAt: null } })
    const issued = await issueMcpAuthorizationCode(prisma, { grantId: grant.id, accountId: session.accountId, tenantId: session.user.tenantId, sessionId: session.sessionId, clientId: client.clientId, redirectUri, scopes, codeChallenge: challenge })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'MCP_ACCESS_GRANTED', entity: 'McpClientGrant', entityId: grant.id, metadata: { clientId: client.clientId, scopes } } })
    const target = new URL(redirectUri); target.searchParams.set('code', issued.code); if (typeof body.state === 'string' && /^[A-Za-z0-9._~-]{1,256}$/.test(body.state)) target.searchParams.set('state', body.state)
    return NextResponse.json({ redirect_uri: target.href })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'No se pudo autorizar el conector.', 500)
    return NextResponse.json({ error: cause.code, error_description: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
