import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { effectivePermissions } from '../auth'
import { actionForScope, MCP_SCOPES, type McpScope } from './catalog'

const CODE_TTL_MS = 60_000
const ACCESS_TTL_MS = 10 * 60_000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000
const CLIENT_ID = /^[A-Za-z0-9._~-]{1,100}$/
const REDIRECT_URI = /^https:\/\//

type Db = Prisma.TransactionClient | typeof prisma
export class McpOAuthError extends Error { constructor(public code: string, message: string, public status = 400) { super(message) } }

export function mcpIssuer() {
  const value = process.env.MOBOS_MCP_ISSUER || process.env.MOBOS_APP_URL
  if (!value) throw new McpOAuthError('not_configured', 'MCP OAuth no está configurado.', 503)
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) throw new McpOAuthError('not_configured', 'El issuer MCP debe ser HTTPS.', 503)
  return url.origin
}

export type McpClient = { clientId: string; redirectUris: readonly string[]; name: string }
export function configuredMcpClients(): readonly McpClient[] {
  const raw = process.env.MOBOS_MCP_CLIENTS_JSON
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): McpClient[] => {
      if (!item || typeof item !== 'object') return []
      const value = item as Record<string, unknown>
      const clientId = typeof value.clientId === 'string' ? value.clientId : ''
      const name = typeof value.name === 'string' ? value.name.slice(0, 120) : clientId
      const redirectUris = Array.isArray(value.redirectUris) ? value.redirectUris.filter((uri): uri is string => typeof uri === 'string' && REDIRECT_URI.test(uri) && !uri.includes('#')) : []
      return CLIENT_ID.test(clientId) && redirectUris.length ? [{ clientId, name, redirectUris }] : []
    })
  } catch { return [] }
}
export function findMcpClient(clientId: unknown, redirectUri?: unknown) {
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) return null
  const client = configuredMcpClients().find(item => item.clientId === clientId)
  if (!client) return null
  if (redirectUri !== undefined && (typeof redirectUri !== 'string' || !client.redirectUris.includes(redirectUri))) return null
  return client
}
export function normalizeMcpScopes(input: unknown): McpScope[] {
  if (!Array.isArray(input) && typeof input !== 'string') return []
  const values = Array.isArray(input) ? input : input.split(/[ ]+/)
  if (!values.length || values.some(value => typeof value !== 'string' || !(MCP_SCOPES as readonly string[]).includes(value))) return []
  return [...new Set(values)] as McpScope[]
}
export function pkceChallenge(verifier: string) { return createHash('sha256').update(verifier).digest('base64url') }
export function validPkceVerifier(verifier: unknown, challenge: string) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const actual = Buffer.from(pkceChallenge(verifier)); const expected = Buffer.from(challenge)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
function secret() { return randomBytes(32).toString('base64url') }
export function hashMcpSecret(value: string) { return createHash('sha256').update(value).digest('hex') }

export async function issueMcpAuthorizationCode(db: Db, input: { grantId: string; accountId: string; tenantId: string; sessionId: string; clientId: string; redirectUri: string; scopes: readonly string[]; codeChallenge: string }, now = new Date()) {
  const code = secret()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
  await db.mcpAuthorizationCode.create({ data: { codeHash: hashMcpSecret(code), grantId: input.grantId, accountId: input.accountId, tenantId: input.tenantId, sessionId: input.sessionId, clientId: input.clientId, redirectUri: input.redirectUri, scopes: [...input.scopes], codeChallenge: input.codeChallenge, expiresAt } })
  return { code, expiresAt }
}

export async function consumeMcpAuthorizationCode(db: Db, rawCode: string, now = new Date()) {
  const count = await db.mcpAuthorizationCode.updateMany({ where: { codeHash: hashMcpSecret(rawCode), usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })
  if (count.count !== 1) throw new McpOAuthError('invalid_grant', 'El código no existe, venció o ya fue utilizado.', 400)
  const row = await db.mcpAuthorizationCode.findUnique({ where: { codeHash: hashMcpSecret(rawCode) }, include: { grant: true } })
  if (!row || row.grant.revokedAt) throw new McpOAuthError('invalid_grant', 'El consentimiento fue revocado.', 400)
  return row
}

export async function issueMcpTokens(db: Db, input: { grantId: string; accountId: string; tenantId: string; sessionId: string; clientId: string; scopes: readonly string[] }, now = new Date()) {
  const accessToken = secret(); const refreshToken = secret()
  await db.mcpAccessToken.create({ data: { tokenHash: hashMcpSecret(accessToken), refreshTokenHash: hashMcpSecret(refreshToken), grantId: input.grantId, accountId: input.accountId, tenantId: input.tenantId, sessionId: input.sessionId, clientId: input.clientId, scopes: [...input.scopes], expiresAt: new Date(now.getTime() + ACCESS_TTL_MS), refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS) } })
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TTL_MS / 1000) }
}

export async function rotateMcpRefreshToken(db: Db, rawRefreshToken: string, clientId: string, now = new Date()) {
  const row = await db.mcpAccessToken.findFirst({ where: { refreshTokenHash: hashMcpSecret(rawRefreshToken), clientId }, include: { grant: true } })
  if (!row || row.revokedAt || row.rotatedAt || !row.refreshExpiresAt || row.refreshExpiresAt <= now || row.grant.revokedAt) throw new McpOAuthError('invalid_grant', 'El refresh token fue revocado, rotado o venció.', 400)
  await db.mcpAccessToken.update({ where: { id: row.id }, data: { rotatedAt: now, revokedAt: now } })
  return issueMcpTokens(db, { grantId: row.grantId, accountId: row.accountId, tenantId: row.tenantId, sessionId: row.sessionId, clientId: row.clientId, scopes: row.scopes }, now)
}

export function oauthMetadata() {
  const issuer = mcpIssuer()
  return { issuer, authorization_endpoint: `${issuer}/api/mcp/authorize`, token_endpoint: `${issuer}/api/mcp/token`, revocation_endpoint: `${issuer}/api/mcp/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], scopes_supported: [...MCP_SCOPES], token_endpoint_auth_methods_supported: ['none'] }
}

export function assertScopeActions(scopes: readonly string[]) {
  if (!scopes.length || scopes.some(scope => !actionForScope(scope))) throw new McpOAuthError('invalid_scope', 'El scope solicitado no está permitido.', 400)
}

/** Validates an MCP bearer against the current MobOS session and membership. */
export async function requireMcpAccessToken(request: Request, now = new Date()) {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) return null
  const row = await prisma.mcpAccessToken.findUnique({ where: { tokenHash: hashMcpSecret(match[1]) }, include: { grant: true, session: { include: { user: true } } } })
  if (!row || row.revokedAt || row.expiresAt <= now || row.grant.revokedAt || row.session.revokedAt || row.session.expiresAt <= now || !row.session.user) return null
  const user = row.session.user
  if (user.status !== 'ACTIVE' || user.tenantId !== row.tenantId || row.session.accountId !== row.accountId) return null
  if (!(await prisma.tenantMembership.findFirst({ where: { accountId: row.accountId, tenantId: row.tenantId, revokedAt: null, userId: user.id }, select: { id: true } }))) return null
  await prisma.mcpAccessToken.update({ where: { id: row.id }, data: { lastUsedAt: now } })
  return { tokenId: row.id, tenantId: row.tenantId, accountId: row.accountId, sessionId: row.sessionId, scopes: row.scopes as McpScope[], user: { id: user.id, tenantId: user.tenantId, name: user.name, role: user.role, branchId: user.branchId, pinLength: user.pinLength, permissions: effectivePermissions(user.role, user.permissions) }, clientId: row.clientId }
}
