import assert from 'node:assert/strict'
const [baseUrl, sellerToken, companyToken] = process.argv.slice(2)
if (!baseUrl || !sellerToken || !companyToken) throw new Error('Uso: seller-unlock-http.mjs <baseUrl> <syntheticSellerToken> <syntheticCompanyToken>')
let checks = 0
async function probe(label, body, headers, status, code) {
  const response = await fetch(`${baseUrl}/api/auth/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const payload = await response.json()
  assert.equal(response.status, status, label)
  assert.match(response.headers.get('cache-control'), /no-store/, label)
  assert.equal(response.headers.get('set-cookie'), null, label)
  assert.ok(!/accessToken|sellerToken|companyToken|tokenHash|pinHash/.test(JSON.stringify(payload)), label)
  if (code) assert.equal(payload.code, code, label)
  if (status === 200) { assert.equal(payload.user.id, 'user-a-it'); assert.equal(payload.user.role, 'VENDEDOR') }
  checks++
}
const browser = { origin: 'https://app.moboss.online', cookie: `mobos_seller_session=${sellerToken}` }
await probe('same seller cookie through middleware', { pin: '2468' }, browser, 200)
await probe('wrong confirmation preserves valid session semantics', { pin: '1111' }, browser, 422, 'INVALID_PIN')
await probe('retry after wrong confirmation', { pin: '2468' }, browser, 200)
await probe('foreign browser origin denied', { pin: '2468' }, { ...browser, origin: 'https://foreign.example.test' }, 401, 'SELLER_SESSION_REQUIRED')
await probe('no authorization denied', { pin: '2468' }, {}, 401, 'SELLER_SESSION_REQUIRED')
await probe('company credential is not a seller session', { pin: '2468' }, { Authorization: `Bearer ${companyToken}` }, 401, 'SELLER_SESSION_REQUIRED')
await probe('cannot select another operator', { pin: '2468', sellerId: 'user-admin-it' }, browser, 400)
await probe('native seller bearer stays seller-only', { pin: '2468' }, { Authorization: `Bearer ${sellerToken}`, origin: 'capacitor://localhost', 'x-mobos-client': 'ios/1.0.238' }, 200)
console.log(`seller-unlock-http: ${checks} checks OK; synthetic credentials only`)
