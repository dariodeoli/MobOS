import { createHash, createPrivateKey, sign } from 'node:crypto'
import { prisma } from './prisma'
import { audienceMatches, JwtError, listEnv, verifyJwtSignature } from './jwks'
import { cifrarSecreto, descifrarSecreto, secretEncryptionConfigured } from './secret-crypto'
import { logError, logInfo } from './log'
import { consumeAuthNonce, NONCE_PATTERN, type NoncePurpose } from './auth-nonce'

// Sign in with Apple para la app de iPhone (docs/IOS.md). Solo entra a cuentas
// que YA tienen tienda vinculada: nunca crea cuentas ni tiendas.
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'
const APPLE_ISSUER = 'https://appleid.apple.com'

export type AppleIdentityClaims = { sub: string; email: string | null; emailVerified: boolean; isPrivateRelay: boolean }

export function appleClientIds() { return listEnv('MOBOS_APPLE_CLIENT_IDS') }

const asBool = (value: unknown) => value === true || value === 'true'

/** Verifica firma (JWKS de Apple), iss, aud, exp y nonce = sha256(nonce crudo) en hex; el crudo lo emitió el servidor y se consume una sola vez. */
export async function verifyAppleIdentityToken(identityToken: unknown, rawNonce: unknown, purpose: NoncePurpose = 'login'): Promise<AppleIdentityClaims> {
  const audiences = appleClientIds()
  if (!audiences.length) throw new JwtError('not_configured')
  if (typeof identityToken !== 'string' || typeof rawNonce !== 'string' || !NONCE_PATTERN.test(rawNonce)) throw new JwtError('invalid_token')
  const claims = await verifyJwtSignature(identityToken, APPLE_JWKS_URL)
  if (claims.iss !== APPLE_ISSUER || !audienceMatches(claims.aud, audiences)) throw new JwtError('invalid_claims')
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new JwtError('invalid_claims')
  const expected = createHash('sha256').update(rawNonce).digest('hex')
  if (typeof claims.nonce !== 'string' || claims.nonce !== expected) throw new JwtError('bad_nonce')
  if (!(await consumeAuthNonce(rawNonce, purpose))) throw new JwtError('bad_nonce')
  const email = typeof claims.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ? claims.email.trim().toLowerCase() : null
  return { sub: claims.sub, email, emailVerified: asBool(claims.email_verified), isPrivateRelay: asBool(claims.is_private_email) || /@privaterelay\.appleid\.com$/i.test(email || '') }
}

function appleKeyConfig() {
  const teamId = process.env.MOBOS_APPLE_TEAM_ID || ''
  const keyId = process.env.MOBOS_APPLE_KEY_ID || ''
  const privateKey = (process.env.MOBOS_APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  const clientId = appleClientIds()[0] || ''
  if (!teamId || !keyId || !privateKey || !clientId) return null
  return { teamId, keyId, privateKey, clientId }
}

/** client_secret de Apple: JWT ES256 firmado con la clave .p8 (vida corta). */
export function appleClientSecret(now = Math.floor(Date.now() / 1000)) {
  const config = appleKeyConfig()
  if (!config) return null
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: config.clientId })).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(config.privateKey), dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${header}.${payload}.${signature}`
}

async function appleForm(path: string, params: Record<string, string>) {
  return fetch(`${APPLE_ISSUER}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(10_000), cache: 'no-store' })
}

/** Canjea el authorizationCode por un refresh token (solo para poder revocarlo después). Nunca lanza. */
export async function exchangeAppleAuthorizationCode(code: unknown): Promise<string | null> {
  const config = appleKeyConfig()
  if (!config || typeof code !== 'string' || !code || code.length > 2048) return null
  try {
    const secret = appleClientSecret()
    if (!secret) return null
    const response = await appleForm('/auth/token', { client_id: config.clientId, client_secret: secret, code, grant_type: 'authorization_code' })
    if (!response.ok) { logInfo('apple_code_exchange_rejected', { status: response.status }); return null }
    const body = await response.json() as { refresh_token?: string }
    return typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null
  } catch (cause) {
    logError('apple_code_exchange_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return null
  }
}

const usoToken = (subject: string) => ({ uso: 'apple-refresh-token', referencia: subject })

let avisoCifrado = false
/** Sin cifrado no se guarda el refresh token de Apple y no se podrá revocar al borrar la cuenta (5.1.1(v)). */
export function warnIfSecretEncryptionMissing() {
  if (avisoCifrado || secretEncryptionConfigured() || !appleKeyConfig()) return
  avisoCifrado = true
  logError('apple_secret_encryption_not_configured', { detail: 'Cifrado de secretos no configurado: no se guardan refresh tokens de Apple. Definí MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID y MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON.' })
}
warnIfSecretEncryptionMissing()

export function sealAppleRefreshToken(subject: string, token: string) {
  if (!secretEncryptionConfigured()) {
    logError('apple_refresh_token_not_sealed', { detail: 'Cifrado de secretos no configurado: el token de Apple no se guardó y no podrá revocarse.' })
    return null
  }
  return cifrarSecreto(token, usoToken(subject))
}

/** Revoca los tokens de Apple de la cuenta (5.1.1(v)). Nunca bloquea el borrado: registra y sigue. */
export async function revokeAppleIdentities(accountId: string): Promise<{ revoked: number; skipped: number }> {
  const rows = await prisma.appleIdentity.findMany({ where: { accountId }, select: { subject: true, refreshTokenEnc: true } })
  const config = appleKeyConfig()
  let revoked = 0, skipped = 0
  for (const row of rows) {
    if (!config || !row.refreshTokenEnc) { skipped += 1; continue }
    try {
      const secret = appleClientSecret()
      if (!secret) { skipped += 1; continue }
      const token = descifrarSecreto(row.refreshTokenEnc, usoToken(row.subject))
      const response = await appleForm('/auth/revoke', { client_id: config.clientId, client_secret: secret, token: String(token), token_type_hint: 'refresh_token' })
      if (response.ok) revoked += 1
      else { skipped += 1; logError('apple_revoke_rejected', { status: response.status }) }
    } catch (cause) {
      skipped += 1
      logError('apple_revoke_error', { error: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return { revoked, skipped }
}

/** Nombre que Apple entrega solo la primera vez: string o { givenName, familyName }. */
export function appleFullName(input: unknown) {
  if (typeof input === 'string') return input.trim().slice(0, 100) || null
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  const joined = [value.givenName, value.familyName].filter(part => typeof part === 'string' && part.trim()).join(' ').trim()
  return joined.slice(0, 100) || null
}
