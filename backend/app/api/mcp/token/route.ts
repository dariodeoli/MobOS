import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { McpOAuthError, consumeMcpAuthorizationCode, findMcpClient, issueMcpTokens, rotateMcpRefreshToken, validPkceVerifier } from '../../../../lib/mcp/oauth'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const client = findMcpClient(body.client_id)
    if (!client) throw new McpOAuthError('invalid_client', 'Cliente no registrado.', 401)
    if (body.grant_type === 'refresh_token') {
      if (typeof body.refresh_token !== 'string') throw new McpOAuthError('invalid_grant', 'Refresh token inválido.', 400)
      const rotated = await rotateMcpRefreshToken(prisma, body.refresh_token, client.clientId)
      return NextResponse.json({ access_token: rotated.accessToken, token_type: 'Bearer', expires_in: rotated.expiresIn, refresh_token: rotated.refreshToken }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body.grant_type !== 'authorization_code' || typeof body.code !== 'string' || typeof body.redirect_uri !== 'string' || typeof body.code_verifier !== 'string') throw new McpOAuthError('invalid_request', 'authorization_code, redirect_uri y code_verifier son obligatorios.', 400)
    const row = await prisma.$transaction(tx => consumeMcpAuthorizationCode(tx, body.code as string))
    if (row.clientId !== client.clientId || row.redirectUri !== body.redirect_uri || !validPkceVerifier(body.code_verifier, row.codeChallenge)) throw new McpOAuthError('invalid_grant', 'El código no coincide con cliente, redirect o PKCE.', 400)
    const tokens = await issueMcpTokens(prisma, { grantId: row.grantId, accountId: row.accountId, tenantId: row.tenantId, sessionId: row.sessionId, clientId: row.clientId, scopes: row.scopes })
    await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'MCP_TOKEN_ISSUED', entity: 'McpAccessToken', metadata: { clientId: row.clientId, scopes: row.scopes } } })
    return NextResponse.json({ access_token: tokens.accessToken, token_type: 'Bearer', expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: row.scopes.join(' ') }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'No se pudo emitir el token.', 500)
    return NextResponse.json({ error: cause.code, error_description: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
