import { createPublicKey, verify } from 'node:crypto'

// Verificación de JWT RS256 contra un JWKS remoto (Apple y Google). Los claims
// específicos de cada proveedor los valida quien llama; acá se prueba la firma,
// el algoritmo, exp/iat y el JWKS se cachea 1 h (con recarga si aparece un kid nuevo).
export class JwtError extends Error {}

type Jwk = { kid?: string; kty?: string; alg?: string; use?: string; n?: string; e?: string }
const cache = new Map<string, { keys: Jwk[]; at: number }>()
const TTL_MS = 60 * 60 * 1000

export function resetJwksCacheForTests() { cache.clear() }

async function loadKeys(url: string, force: boolean) {
  const hit = cache.get(url)
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.keys
  // Un kid desconocido recarga a lo sumo una vez por minuto (evita amplificar basura hacia el proveedor).
  if (hit && force && Date.now() - hit.at < 60_000) return hit.keys
  let body: { keys?: Jwk[] }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    if (!response.ok) throw new Error(`status ${response.status}`)
    body = await response.json() as { keys?: Jwk[] }
  } catch { throw new JwtError('jwks_unavailable') }
  const keys = Array.isArray(body.keys) ? body.keys : []
  cache.set(url, { keys, at: Date.now() })
  return keys
}

export async function verifyJwtSignature(token: string, jwksUrl: string): Promise<Record<string, any>> {
  if (typeof token !== 'string' || token.length > 4096) throw new JwtError('invalid_token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new JwtError('invalid_token')
  let header: any, claims: any
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch { throw new JwtError('invalid_token') }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') throw new JwtError('invalid_token')
  const find = (keys: Jwk[]) => keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'))
  let key = find(await loadKeys(jwksUrl, false))
  if (!key) key = find(await loadKeys(jwksUrl, true))
  if (!key) throw new JwtError('unknown_key')
  const valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: key as any, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))
  if (!valid) throw new JwtError('bad_signature')
  const now = Date.now() / 1000
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new JwtError('expired')
  if (Number.isFinite(claims.iat) && claims.iat > now + 60) throw new JwtError('invalid_token')
  return claims
}

export function audienceMatches(aud: unknown, allowed: string[]) {
  const values = Array.isArray(aud) ? aud : [aud]
  return values.some(value => typeof value === 'string' && allowed.includes(value))
}

export function listEnv(name: string) {
  return String(process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean)
}
