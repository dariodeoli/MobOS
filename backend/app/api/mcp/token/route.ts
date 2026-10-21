import { assertMcpEnabled } from '../../../../lib/mcp/oauth'
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { McpOAuthError, consumeMcpAuthorizationCode, dbNow, findMcpClient, issueMcpTokens, rotateMcpRefreshToken, revokeMcpRefreshFamily, validPkceVerifier, mcpResource, hashMcpSecret } from '../../../../lib/mcp/oauth'
import { readBoundedBody } from '../../../../lib/mcp/request-body'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    assertMcpEnabled()
    const raw = await readBoundedBody(request, 64 * 1024); if (raw === null) return NextResponse.json({ error: 'request_too_large' }, { status: 413 }); const body = Object.fromEntries(new URLSearchParams(raw)) as Record<string, unknown>
    const client = findMcpClient(body.client_id)
    if (!client) throw new McpOAuthError('invalid_client', 'Cliente no registrado.', 401)
    if (body.resource !== mcpResource()) throw new McpOAuthError('invalid_target', 'El resource no coincide con MobOS.', 400)
    if (body.grant_type === 'refresh_token') {
      if (typeof body.refresh_token !== 'string') throw new McpOAuthError('invalid_grant', 'Refresh token inválido.', 400)
      let rotated
      try { rotated = await prisma.$transaction(tx => rotateMcpRefreshToken(tx, body.refresh_token as string, client.clientId)) }
      catch (error) { if (error instanceof McpOAuthError && error.code === 'invalid_grant') await revokeMcpRefreshFamily(body.refresh_token as string, client.clientId); throw error }
      return NextResponse.json({ access_token: rotated.accessToken, token_type: 'Bearer', expires_in: rotated.expiresIn, refresh_token: rotated.refreshToken }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body.grant_type !== 'authorization_code' || typeof body.code !== 'string' || typeof body.redirect_uri !== 'string' || typeof body.code_verifier !== 'string') throw new McpOAuthError('invalid_request', 'authorization_code, redirect_uri y code_verifier son obligatorios.', 400)
    const now = await dbNow(prisma)
    const candidate = await prisma.mcpAuthorizationCode.findUnique({ where: { codeHash: hashMcpSecret(body.code as string) }, select: { clientId: true, resource: true, redirectUri: true, codeChallenge: true, usedAt: true, expiresAt: true } })
    if (!candidate || candidate.usedAt || candidate.expiresAt <= now || candidate.clientId !== client.clientId || candidate.resource !== body.resource || candidate.redirectUri !== body.redirect_uri || !validPkceVerifier(body.code_verifier, candidate.codeChallenge)) throw new McpOAuthError('invalid_grant', 'El código no coincide con cliente, redirect o PKCE.', 400)
    const row = await prisma.$transaction(tx => consumeMcpAuthorizationCode(tx, body.code as string))
    const tokens = await issueMcpTokens(prisma, { grantId: row.grantId, accountId: row.accountId, tenantId: row.tenantId, sessionId: row.sessionId, userId: row.userId, clientId: row.clientId, resource: row.resource, scopes: row.scopes })
    await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'MCP_TOKEN_ISSUED', entity: 'McpAccessToken', metadata: { clientId: row.clientId, scopes: row.scopes } } })
    return NextResponse.json({ access_token: tokens.accessToken, token_type: 'Bearer', expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: row.scopes.join(' ') }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'No se pudo emitir el token.', 500)
    return NextResponse.json({ error: cause.code, error_description: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
