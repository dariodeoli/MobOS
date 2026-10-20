import { NextResponse } from 'next/server'
import { requireSession } from '../../../../lib/auth'
import { sameOrigin } from '../../../../lib/google-oauth'
import { prisma } from '../../../../lib/prisma'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { actionForScope } from '../../../../lib/mcp/catalog'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { assertScopeActions, dbNow, issueMcpAuthorizationCode, findMcpClient, normalizeMcpScopes, McpOAuthError, mcpIssuer, mcpResource } from '../../../../lib/mcp/oauth'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('response_type') !== 'code') return NextResponse.json({ error: 'unsupported_response_type' }, { status: 400 })
  const session = await requireSession(request)
  if (!session) {
    const appOrigin = (() => { try { return new URL(process.env.MOBOS_APP_URL || mcpIssuer()).origin } catch { return mcpIssuer() } })()
    const returnTo = `/mcp/autorizar?request=${encodeURIComponent(`${url.pathname}${url.search}`)}`
    const login = new URL('/login', appOrigin); login.searchParams.set('returnTo', returnTo)
    return NextResponse.redirect(login, { status: 303 })
  }
  const state = url.searchParams.get('state')
  if (state && !/^[A-Za-z0-9._~-]{1,256}$/.test(state)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const client = findMcpClient(url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'))
  if (!client || url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if ((url.searchParams.get('resource') || '') !== mcpResource()) return NextResponse.json({ error: 'invalid_target' }, { status: 400 })
  const scopes = normalizeMcpScopes(url.searchParams.get('scope'))
  if (!scopes.length) return NextResponse.json({ error: 'invalid_scope' }, { status: 400 })
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`
  const fields = [['client_id', client.clientId], ['redirect_uri', url.searchParams.get('redirect_uri') || ''], ['scope', scopes.join(' ')], ['resource', url.searchParams.get('resource') || ''], ['code_challenge', url.searchParams.get('code_challenge') || ''], ['code_challenge_method', 'S256'], ['state', url.searchParams.get('state') || '']].map(([name, value]) => hidden(name, value)).join('')
  const safeName = client.name.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { name: true } })
  const safeTenant = (tenant?.name || 'tu empresa').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
  const labels = scopes.map(scope => `<li>${scope.replace(/[&<>"']/g, '')}</li>`).join('')
  return new NextResponse(`<!doctype html><html lang="es"><body><h1>Autorizar conexión</h1><p><strong>${safeName}</strong> solicita acceso a <strong>${safeTenant}</strong>.</p><ul>${labels}</ul><form method="post">${fields}<button name="decision" value="approve" type="submit">Autorizar</button><button name="decision" value="deny" type="submit">Cancelar</button></form></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  try {
    if (request.headers.has('authorization') || !sameOrigin(request)) throw new McpOAuthError('invalid_request', 'La autorización MCP requiere la sesión web de MobOS.', 401)
    const session = await requireSession(request)
    if (!session) throw new McpOAuthError('login_required', 'Iniciá sesión en MobOS para autorizar el conector.', 401)
    const body = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')
      ? Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>
      : await request.json() as Record<string, unknown>
    const client = findMcpClient(body.client_id, body.redirect_uri)
    if (!client) throw new McpOAuthError('invalid_client', 'Cliente o redirect URI no registrado.', 400)
    if (body.decision === 'deny') {
      const target = new URL(body.redirect_uri as string); target.searchParams.set('error', 'access_denied'); if (typeof body.state === 'string' && /^[A-Za-z0-9._~-]{1,256}$/.test(body.state)) target.searchParams.set('state', body.state)
      return NextResponse.redirect(target, { status: 303 })
    }
    const scopes = normalizeMcpScopes(body.scope)
    assertScopeActions(scopes)
    const redirectUri = body.redirect_uri as string
    const resource = typeof body.resource === 'string' ? body.resource : mcpResource()
    if (resource !== mcpResource()) throw new McpOAuthError('invalid_target', 'El resource no coincide con MobOS.', 400)
    const challenge = typeof body.code_challenge === 'string' ? body.code_challenge : ''
    if (!/^S256$/.test(String(body.code_challenge_method)) || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) throw new McpOAuthError('invalid_request', 'PKCE S256 es obligatorio.', 400)
    const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true, archivedAt: true } })
    if (!tenant || tenant.archivedAt) throw new McpOAuthError('access_denied', 'La empresa no está disponible.', 403)
    const enabledModules = moduleStoreFrom(tenant.settings).modules
    for (const scope of scopes) {
      const action = actionForScope(scope)
      if (!action || !authorizeMcpAction(action, { tenantId: session.user.tenantId, user: session.user, enabledModules, grantedScopes: scopes }).allowed) throw new McpOAuthError('access_denied', `No tenés permiso para autorizar ${scope}.`, 403)
    }
    const accountId = session.accountId ?? null
    const tenantId = session.user.tenantId
    const issued = await prisma.$transaction(async tx => {
      const grant = await tx.mcpClientGrant.upsert({ where: { tenantId_userId_clientId_redirectUri: { tenantId, userId: session.user.id, clientId: client.clientId, redirectUri } }, create: { accountId, tenantId, userId: session.user.id, clientId: client.clientId, redirectUri, resource, scopes: [...scopes] }, update: { accountId, resource, scopes: [...scopes], revokedAt: null } })
      const now = await dbNow(tx)
      await tx.mcpAccessToken.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: now } })
      await tx.mcpAuthorizationCode.updateMany({ where: { grantId: grant.id, usedAt: null }, data: { usedAt: now } })
      const issued = await issueMcpAuthorizationCode(tx, { grantId: grant.id, accountId, tenantId, sessionId: session.sessionId, userId: session.user.id, clientId: client.clientId, redirectUri, resource, scopes, codeChallenge: challenge }, now)
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'MCP_ACCESS_GRANTED', entity: 'McpClientGrant', entityId: grant.id, metadata: { clientId: client.clientId, scopes } } })
      return issued
    })
    const target = new URL(redirectUri); target.searchParams.set('code', issued.code); if (typeof body.state === 'string' && /^[A-Za-z0-9._~-]{1,256}$/.test(body.state)) target.searchParams.set('state', body.state)
    return NextResponse.redirect(target, { status: 303 })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'No se pudo autorizar el conector.', 500)
    return NextResponse.json({ error: cause.code, error_description: cause.message }, { status: cause.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
