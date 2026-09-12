import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto'

// This module is imported only by server routes. Never expose these variables via VITE_/NEXT_PUBLIC_.
export class AuthFlowError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
export function authConfig() {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'MOBOS_AUTH_SECRET', 'MOBOS_APP_URL'] as const
  if (required.some(key => !process.env[key])) throw new AuthFlowError('not_configured', 'El acceso con Google todavía no está configurado en el servidor.', 503)
  const callback = new URL(process.env.GOOGLE_REDIRECT_URI!)
  const app = new URL(process.env.MOBOS_APP_URL!)
  for (const url of [callback, app]) {
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost'))) throw new AuthFlowError('not_configured', 'La configuración de las URL de acceso no es válida.', 503)
  }
  if (callback.pathname !== '/api/auth/google/callback' || app.pathname !== '/' || !/^[a-f0-9]{64}$/i.test(process.env.MOBOS_AUTH_SECRET!)) throw new AuthFlowError('not_configured', 'La configuración de Google o de la clave de sesión no es válida.', 503)
  return { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, callback: callback.href, app: app.origin, secure: callback.protocol === 'https:', key: Buffer.from(process.env.MOBOS_AUTH_SECRET!, 'hex') }
}
export const COOKIE_FLOW = 'mobos_google_flow'
export const COOKIE_IDENTITY = 'mobos_google_identity'
export const COOKIE_COMPANY = 'mobos_google_company'
export function cookieOptions(maxAge = 600) {
  return { httpOnly: true, secure: authConfig().secure, sameSite: 'lax' as const, path: '/api/auth', maxAge }
}
export function readCookie(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) || ''
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === authConfig().app
}
export function seal(purpose: string, value: object) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', authConfig().key, iv)
  cipher.setAAD(Buffer.from(purpose))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ ...value, exp: Date.now() + 600_000 })), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}
export function unseal(purpose: string, token: string): any {
  try {
    const bytes = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', authConfig().key, bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(bytes.subarray(12, 28))
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
    if (!Number.isFinite(value.exp) || value.exp <= Date.now()) throw new Error()
    return value
  } catch { throw new AuthFlowError('expired', 'El acceso venció o no es válido. Volvé a iniciar con Google.', 401) }
}
export function matchesState(actual: string, expected: string) {
  return !!actual && !!expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}
export function beginGoogle(intent: string) {
  const config = authConfig()
  const flow = { state: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'), intent: intent === 'create' ? 'create' : 'login' }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', scope: 'openid email profile', state: flow.state, nonce: flow.nonce, code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString()
  return { url, cookie: seal('flow', flow) }
}
export type GoogleIdentity = { sub: string; email: string; name: string }
export async function verifyGoogleToken(token: string, nonce: string): Promise<GoogleIdentity> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid identity')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid identity')
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  if (!response.ok) throw new Error('Identity provider unavailable')
  const jwks = await response.json()
  const key = jwks.keys?.find((key: any) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256')
  if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid identity')
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  const now = Date.now() / 1000
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== authConfig().clientId || (claims.azp && claims.azp !== authConfig().clientId) || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.nonce !== nonce || claims.email_verified !== true || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw new Error('Invalid identity')
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '' }
}
export async function exchangeGoogle(code: string, flow: { verifier: string; nonce: string }) {
  const config = authConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callback, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  if (!response.ok) throw new AuthFlowError('provider', 'Google no pudo completar el acceso. Revisá la configuración o volvé a intentarlo.', 502)
  const tokens = await response.json()
  if (typeof tokens.id_token !== 'string') throw new Error('Missing identity')
  return verifyGoogleToken(tokens.id_token, flow.nonce)
}
