import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { resetJwksCacheForTests } from '../lib/jwks'
import { verifyGoogleNativeToken } from '../lib/native-auth'

const IOS = '500595134387-ios.apps.googleusercontent.com'
const WEB = '500595134387-web.apps.googleusercontent.com'
process.env.MOBOS_GOOGLE_IOS_CLIENT_ID = IOS
process.env.GOOGLE_CLIENT_ID = WEB
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const realFetch = globalThis.fetch
const fakeFetch = (async () => Response.json({ keys: [jwk] })) as typeof fetch
const withFetch = async <T>(fn: () => Promise<T>) => { resetJwksCacheForTests(); globalThis.fetch = fakeFetch; try { return await fn() } finally { globalThis.fetch = realFetch } }

const NONCE = 'a'.repeat(32) + 'b'.repeat(32)
const sha = (v: string) => createHash('sha256').update(v).digest('hex')
function token(extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url')
  const c = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: IOS, azp: IOS, sub: 's1', email: 'Uno@Example.test', email_verified: true, nonce: NONCE, iat: now, exp: now + 600, ...extra })).toString('base64url')
  return `${h}.${c}.${sign('RSA-SHA256', Buffer.from(`${h}.${c}`), privateKey).toString('base64url')}`
}
const run = (t: string, nonce = NONCE) => withFetch(() => verifyGoogleNativeToken(t, nonce, 'login', { consume: async () => true }))

test('token válido con nonce crudo', async () => { assert.equal((await run(token())).email, 'uno@example.test') })
test('nonce hasheado (sha256) por el SDK también ata al nonce emitido', async () => { assert.equal((await run(token({ nonce: sha(NONCE) }))).sub, 's1') })
test('aud del cliente web solo vale con azp iOS', async () => {
  assert.equal((await run(token({ aud: WEB, azp: IOS }))).sub, 's1')
  await assert.rejects(() => run(token({ aud: WEB, azp: 'otro' })), /invalid_claims/)
})
test('rechaza nonce distinto, ausente, aud ajeno, email sin verificar, firma ajena y nonce ya consumido', async () => {
  await assert.rejects(() => run(token({ nonce: 'c'.repeat(64) })), /bad_nonce/)
  await assert.rejects(() => run(token({ nonce: undefined })), /bad_nonce/)
  await assert.rejects(() => run(token({ aud: 'x', azp: 'x' })), /invalid_claims/)
  await assert.rejects(() => run(token({ email_verified: false })), /invalid_claims/)
  await assert.rejects(() => run(token({ iss: 'https://evil.test' })), /invalid_claims/)
  const [h, c] = token().split('.')
  await assert.rejects(() => run(`${h}.${c}.${Buffer.from('mala').toString('base64url')}`), /bad_signature/)
  await assert.rejects(() => withFetch(() => verifyGoogleNativeToken(token(), NONCE, 'login', { consume: async () => false })), /bad_nonce/)
})
