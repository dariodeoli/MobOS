#!/usr/bin/env node

// Mi cuenta (#253): superficie personal de cualquier rol — perfil (nombre y
// correo), sesiones propias y acciones de autoservicio. No pide permisos de
// administración, no muestra datos de otros integrantes y no filtra secretos.
// Uso: node backend/tests/mi-cuenta.mjs BASE_URL ADMIN_TOKEN SELLER_TOKEN

import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken, companyToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !companyToken) throw new Error('Uso: mi-cuenta.mjs <baseUrl> <adminToken> <sellerToken> <companyToken>')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
const FORBIDDEN = ['pinHash', 'passwordHash', 'tokenHash', 'publicToken', 'idempotencyKey', 'storageKey']

async function request(path, method = 'GET', body, token = adminToken) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...tenantHeaders,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

// ── El dueño ve su perfil y sus sesiones ─────────────────────────────────────
let result = await request('/api/mi-cuenta')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const admin = result.payload
assert.ok(admin.perfil?.id && admin.perfil?.name, 'El perfil debe traer id y nombre.')
assert.equal(admin.perfil.role, 'ADMIN')
assert.equal(admin.perfil.email, 'admin-it@example.invalid')
assert.ok(admin.currentSessionId, 'La cuenta debe marcar la sesión actual.')
assert.ok(Array.isArray(admin.sessions) && admin.sessions.length >= 1, 'Debe listar las sesiones propias.')
assert.ok(admin.sessions.every(sesion => sesion.id && sesion.level && sesion.lastSeenAt), 'Cada sesión trae id, nivel y última actividad.')
assert.ok(admin.sessions.some(sesion => sesion.id === admin.currentSessionId), 'La sesión actual está en la lista.')
const serializado = JSON.stringify(admin)
for (const campo of FORBIDDEN) assert.equal(serializado.includes(campo), false, `Mi cuenta no debe exponer ${campo}.`)

// ── El vendedor ve lo suyo, nunca lo del dueño ───────────────────────────────
result = await request('/api/mi-cuenta', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const vendedor = result.payload
assert.equal(vendedor.perfil.role, 'VENDEDOR')
assert.ok(vendedor.perfil.id && vendedor.perfil.id !== admin.perfil.id, 'Cada persona ve su propio perfil.')
assert.equal(vendedor.sessions.some(sesion => sesion.id === admin.currentSessionId), false, 'No debe listar sesiones de otro integrante.')
assert.ok(vendedor.sessions.every(sesion => sesion.id !== admin.currentSessionId), 'Sin sesiones ajenas en la lista.')

// ── Cambiar el nombre propio (y volver) ──────────────────────────────────────
const nombreOriginal = vendedor.perfil.name
result = await request('/api/mi-cuenta', 'PATCH', { action: 'updateName', name: 'A' }, sellerToken)
assert.equal(result.response.status, 400, 'Un nombre de una letra no es válido.')
result = await request('/api/mi-cuenta', 'PATCH', { action: 'updateName', name: `${nombreOriginal} IT` }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.perfil?.name, `${nombreOriginal} IT`)
result = await request('/api/mi-cuenta', 'GET', undefined, sellerToken)
assert.equal(result.payload.perfil.name, `${nombreOriginal} IT`, 'El nombre nuevo viaja en el perfil.')
result = await request('/api/mi-cuenta', 'PATCH', { action: 'updateName', name: nombreOriginal }, sellerToken)
assert.equal(result.response.status, 200, 'El nombre se restaura.')

// ── Sesiones: la actual no se revoca; las ajenas no se tocan ─────────────────
result = await request('/api/mi-cuenta', 'PATCH', { action: 'revokeSession', sessionId: vendedor.currentSessionId }, sellerToken)
assert.equal(result.response.status, 409, 'La sesión actual se cierra con Salir, no desde acá.')
result = await request('/api/mi-cuenta', 'PATCH', { action: 'revokeSession', sessionId: admin.currentSessionId }, sellerToken)
assert.equal(result.response.status, 404, 'No se puede revocar la sesión de otra persona.')
result = await request('/api/mi-cuenta', 'PATCH', { action: 'revokeSession', sessionId: 'sesion-inexistente' }, sellerToken)
assert.equal(result.response.status, 404)

// Una segunda sesión propia (otro dispositivo) para revocarla de verdad.
const segundaRespuesta = await fetch(`${baseUrl}/api/auth/pin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...tenantHeaders, Authorization: `Bearer ${companyToken}` },
  body: JSON.stringify({ sellerId: 'user-a-it', pin: '2468' }),
})
assert.equal(segundaRespuesta.status, 200, 'Se crea la segunda sesión del vendedor.')
const cookieSegunda = (segundaRespuesta.headers.getSetCookie?.() || []).map(cookie => cookie.split(';')[0]).find(cookie => cookie.startsWith('mobos_seller_session='))
assert.ok(cookieSegunda, 'La segunda sesión debe traer su cookie.')
const segundaToken = cookieSegunda.split('=')[1]
result = await request('/api/mi-cuenta', 'GET', undefined, segundaToken)
assert.equal(result.response.status, 200, 'La segunda sesión ve su propia cuenta.')
assert.equal(result.payload.perfil.id, vendedor.perfil.id)

result = await request('/api/mi-cuenta', 'PATCH', { action: 'revokeOtherSessions' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.revoked >= 1, 'Debe revocar al menos la segunda sesión.')
result = await request('/api/mi-cuenta', 'GET', undefined, segundaToken)
assert.equal(result.response.status, 401, 'La segunda sesión quedó revocada.')
result = await request('/api/mi-cuenta', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200, 'La sesión actual sigue viva tras cerrar las demás.')
assert.equal(result.payload.sessions.some(sesion => sesion.id === admin.currentSessionId), false, 'No toca las sesiones de otras personas.')
result = await request('/api/mi-cuenta', 'PATCH', { action: 'acción-inválida' }, sellerToken)
assert.equal(result.response.status, 400)
result = await request('/api/mi-cuenta', 'GET', undefined, null)
assert.equal(result.response.status, 401, 'Sin sesión no hay mi cuenta.')

console.log('mi-cuenta: perfil, nombre y sesiones propias OK (autoservicio para cualquier rol, sin secretos ni datos de terceros).')
