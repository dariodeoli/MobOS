import assert from 'node:assert/strict'

// Invitaciones visibles en la app: el usuario autenticado lista las
// invitaciones pendientes dirigidas a su email (en cualquier empresa) y las
// acepta por id, sin el token crudo del correo.
//
// Datos: las invitaciones se siembran en integration-http.sh porque el arnés
// no configura el relay de correo (POST /api/user-invitations responde 503).
const [baseUrl, adminToken, otherSellerToken, sellerBToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !otherSellerToken || !sellerBToken) throw new Error('Uso: invitation-app.mjs <baseUrl> <adminToken> <otherSellerToken> <sellerBToken>')

async function request(path, method = 'GET', body, token) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'x-tenant-id': 'tenant-a-it', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const INVALID_MESSAGE = 'La invitación no es válida o ya venció.'
let result

// 1. Sin sesión, ambos endpoints rechazan.
result = await request('/api/user-invitations/pending')
assert.equal(result.response.status, 401, JSON.stringify(result.payload))
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-a-b-it', pin: '1357', deviceId: 'anon-device' })
assert.equal(result.response.status, 401, JSON.stringify(result.payload))

// 2. Creación vía API: el arnés no configura el relay de correo, por eso el
//    POST queda en 503 (o crea la invitación si algún día se configura).
result = await request('/api/user-invitations', 'POST', { name: 'Synthetic Invite', email: 'synthetic-invite-it@example.invalid', role: 'VENDEDOR' }, adminToken)
assert.ok([201, 503].includes(result.response.status), `POST /api/user-invitations devolvió HTTP ${result.response.status} (esperado 503 sin relay o 201 con relay).`)
console.log(`invitation-app: POST /api/user-invitations sin relay en el arnés devolvió HTTP ${result.response.status}; el flujo usa las invitaciones sembradas por SQL.`)

// 3. El seller de tenant-b ve las invitaciones dirigidas a SU email, con la
//    empresa invitadora, sin tokenHash.
result = await request('/api/user-invitations/pending', 'GET', undefined, sellerBToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(Array.isArray(result.payload), 'pending debe ser una lista.')
const inviteA = result.payload.find(item => item.id === 'invite-a-b-it')
assert.ok(inviteA, 'La invitación de tenant-a no aparece para seller-b-it.')
assert.equal(inviteA.companyName, 'Tenant A Integration')
assert.equal(inviteA.inviterName, 'Admin Test')
assert.equal(inviteA.role, 'VENDEDOR')
assert.equal(inviteA.branchId, 'branch-a-it')
assert.ok(inviteA.expiresAt && inviteA.createdAt, 'La invitación debe incluir expiresAt y createdAt.')
assert.ok(!('tokenHash' in inviteA) && !('token' in inviteA), 'pending nunca debe exponer tokenHash ni token.')
const inviteC = result.payload.find(item => item.id === 'invite-c-b-it')
assert.ok(inviteC, 'La invitación de tenant-c (mismo email) no aparece en pending.')
assert.equal(inviteC.companyName, 'Tenant C Integration')
assert.equal(inviteC.role, 'GERENTE')

// 4. Otro seller de tenant-a (email distinto) NO ve la invitación.
result = await request('/api/user-invitations/pending', 'GET', undefined, otherSellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(Array.isArray(result.payload) && !result.payload.some(item => item.id === 'invite-a-b-it'), 'Un seller con otro email no debe ver la invitación ajena.')

// 5. Ese otro seller tampoco puede aceptarla: 404 para id inexistente y 410
//    para invitación válida pero de otro email (mismo mensaje, sin detalles).
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-nonexistent-it', pin: '1357', deviceId: 'other-seller-device' }, otherSellerToken)
assert.ok([404, 410].includes(result.response.status), `id inexistente devolvió HTTP ${result.response.status}.`)
assert.equal(result.payload?.message, INVALID_MESSAGE)
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-c-b-it', pin: '1357', deviceId: 'other-seller-device' }, otherSellerToken)
assert.ok([404, 410].includes(result.response.status), `email ajeno devolvió HTTP ${result.response.status}.`)
assert.equal(result.payload?.message, INVALID_MESSAGE)

// 6. PIN inválido se rechaza con 400.
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-a-b-it', pin: '12ab', deviceId: 'invite-app-device-b' }, sellerBToken)
assert.equal(result.response.status, 400, JSON.stringify(result.payload))

// 7. Aceptación real: crea el User en tenant-a sin cookies ni cambio de sesión.
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-a-b-it', pin: '1357', deviceId: 'invite-app-device-b' }, sellerBToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.ok, true)
assert.equal(result.payload.user.tenantId, 'tenant-a-it')
assert.equal(result.payload.user.role, 'VENDEDOR')
assert.equal(result.payload.user.branchId, 'branch-a-it')
assert.ok(!result.response.headers.get('set-cookie'), 'accept-by-id no debe emitir cookies ni pisar la sesión actual.')
result = await request('/api/auth/me', 'GET', undefined, sellerBToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.user.tenantId, 'tenant-b-it', 'La sesión actual debe seguir en tenant-b.')

// 8. El admin de tenant-a ve al nuevo usuario con el rol y la sucursal de la invitación.
result = await request('/api/users', 'GET', undefined, adminToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const member = result.payload.find(item => item.email === 'seller-b-it@example.invalid')
assert.ok(member, 'El usuario aceptado no existe en tenant-a.')
assert.equal(member.role, 'VENDEDOR')
assert.equal(member.branchId, 'branch-a-it')
assert.equal(member.status, 'ACTIVE')

// 9. Segunda aceptación de la misma invitación: consumida → 404/410.
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-a-b-it', pin: '1357', deviceId: 'invite-app-device-b' }, sellerBToken)
assert.ok([404, 410].includes(result.response.status), `aceptación repetida devolvió HTTP ${result.response.status}.`)
assert.equal(result.payload?.message, INVALID_MESSAGE)

// 10. Invitación de una tienda donde ese email YA tiene usuario: 409 claro.
result = await request('/api/user-invitations/accept-by-id', 'POST', { id: 'invite-b-b-it', pin: '1357', deviceId: 'invite-app-device-b' }, sellerBToken)
assert.equal(result.response.status, 409, JSON.stringify(result.payload))
assert.equal(result.payload.message, 'Ya sos parte de esa tienda.')

// 11. La invitación aceptada dejó de aparecer; las demás siguen pendientes.
result = await request('/api/user-invitations/pending', 'GET', undefined, sellerBToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(!result.payload.some(item => item.id === 'invite-a-b-it'), 'La invitación consumida no debe seguir en pending.')
assert.ok(result.payload.some(item => item.id === 'invite-c-b-it'), 'La invitación de tenant-c debe seguir pendiente.')

console.log('invitation-app: checks OK (pending por email, aceptación por id sin token, 409 si ya es miembro, sin cookies ni cambio de sesión).')
