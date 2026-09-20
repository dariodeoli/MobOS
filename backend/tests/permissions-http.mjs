import assert from 'node:assert/strict'

// Permisos granulares aplicados en el backend (#100): catálogo, matriz por rol
// de los grupos migrados (caja/finanzas, equipo, impresión/puentes,
// marketing/campañas, compras y autorizaciones) y el recorte efectivo por
// integrante: lo configurado solo quita, nunca concede, y se aplica en la ruta.

const [baseUrl, adminToken, sellerToken, cajeraToken, gerenteToken, companyToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !gerenteToken || !companyToken) {
  throw new Error('Uso: permissions-http.mjs <baseUrl> <adminToken> <sellerToken> <cajeraToken> <gerenteToken> <companyToken>')
}

async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

async function loginSeller(sellerId, pin) {
  const response = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${companyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerId, pin }),
  })
  assert.equal(response.status, 200, `No se pudo iniciar sesión como ${sellerId}: HTTP ${response.status}`)
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean)
  const cookie = cookies.find(value => value && value.startsWith('mobos_seller_session='))
  assert.ok(cookie, 'El login de vendedor no emitió la cookie de sesión.')
  const payload = await response.json()
  return { token: cookie.split(';')[0].split('=').slice(1).join('='), user: payload.user }
}

// ── Catálogo: el backend es la fuente de verdad ─────────────────────────────
let result = await request('/api/permissions')
assert.equal(result.status, 200, JSON.stringify(result.payload))
const catalogo = result.payload
const ids = new Set(catalogo.permissions.map(item => item.id))
for (const permiso of ['finance:read', 'finance:manage', 'collections:manage', 'marketing:manage', 'authorizations:resolve', 'print:metrics', 'team:manage', 'print:manage', 'finance:config', 'commissions:settle', 'delivery:use', 'delivery:manage']) {
  assert.ok(ids.has(permiso), `El catálogo debe incluir ${permiso}.`)
}
for (const item of catalogo.permissions) assert.ok(item.label.trim().length > 3, `Etiqueta vacía en ${item.id}.`)
const porRol = (role) => (catalogo.byRole?.[role] || []).map(item => item.id)
for (const permiso of ['finance:read', 'finance:manage', 'collections:manage', 'marketing:manage', 'print:metrics', 'authorizations:resolve', 'commissions:settle', 'purchases:manage']) {
  assert.ok(porRol('GERENTE').includes(permiso), `Gerencia debería tener ${permiso} en su base.`)
}
assert.ok(porRol('CAJERA').includes('finance:read') && porRol('CAJERA').includes('collections:manage'))
assert.equal(porRol('GERENTE').includes('team:manage'), false, 'team:manage es solo del dueño.')
assert.equal(porRol('GERENTE').includes('print:manage'), false, 'print:manage es solo del dueño.')
assert.equal(porRol('CAJERA').includes('marketing:manage'), false)
assert.ok(porRol('REPARTIDOR').includes('delivery:use'))

result = await request('/api/permissions', { token: sellerToken })
assert.equal(result.status, 403, 'Un vendedor no lee el catálogo de permisos.')

// ── Matriz por rol de los grupos migrados ───────────────────────────────────
const matriz = [
  ['GET', '/api/users', { ADMIN: 200, GERENTE: 403, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/user-invitations', { ADMIN: 200, GERENTE: 403, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/print/bridges', { ADMIN: 200, GERENTE: 403, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/print/metrics', { ADMIN: 200, GERENTE: 200, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/finance', { ADMIN: 200, GERENTE: 200, CAJERA: 200, VENDEDOR: 403 }],
  ['GET', '/api/credits', { ADMIN: 200, GERENTE: 200, CAJERA: 200, VENDEDOR: 403 }],
  ['GET', '/api/cash/audit', { ADMIN: 200, GERENTE: 200, CAJERA: 200, VENDEDOR: 403 }],
  ['GET', '/api/suppliers', { ADMIN: 200, GERENTE: 200, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/customers/segments', { ADMIN: 200, GERENTE: 200, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/marketing/campaigns', { ADMIN: 200, GERENTE: 200, CAJERA: 403, VENDEDOR: 403 }],
  ['GET', '/api/collections/reminders', { ADMIN: 200, GERENTE: 200, CAJERA: 200, VENDEDOR: 403 }],
]
const tokens = { ADMIN: adminToken, GERENTE: gerenteToken, CAJERA: cajeraToken, VENDEDOR: sellerToken }
for (const [method, path, esperado] of matriz) {
  for (const [role, status] of Object.entries(esperado)) {
    const answer = await request(path, { method, token: tokens[role] })
    assert.equal(answer.status, status, `${method} ${path} como ${role}: esperado ${status}, recibido ${answer.status}`)
  }
}

// Escrituras: la puerta de permiso corre antes de validar el cuerpo.
const escrituras = [
  ['POST', '/api/message-templates', {}, { ADMIN: 400, GERENTE: 400, CAJERA: 403, VENDEDOR: 403 }],
  ['POST', '/api/marketing/campaigns', {}, { ADMIN: 400, GERENTE: 400, CAJERA: 403, VENDEDOR: 403 }],
  ['PATCH', '/api/authorizations', { id: 'no-existe', action: 'approve' }, { ADMIN: 404, GERENTE: 404, CAJERA: 403, VENDEDOR: 403 }],
  ['POST', '/api/finance', { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: '1' }, { ADMIN: 400, GERENTE: 400, CAJERA: 400, VENDEDOR: 403 }],
]
for (const [method, path, cuerpo, esperado] of escrituras) {
  for (const [role, status] of Object.entries(esperado)) {
    const answer = await request(path, { method, body: cuerpo, token: tokens[role] })
    assert.equal(answer.status, status, `${method} ${path} como ${role}: esperado ${status}, recibido ${answer.status}`)
  }
}

// ── Recorte efectivo por integrante ─────────────────────────────────────────
// Gerencia conserva sus permisos salvo marketing: el recorte debe notarse en
// la ruta, en la sesión nueva y en el `effectivePermissions` que lee la UI.
const baseGerente = porRol('GERENTE')
const recortado = baseGerente.filter(permiso => permiso !== 'marketing:manage')
assert.ok(baseGerente.includes('marketing:manage') && !recortado.includes('marketing:manage'))

result = await request('/api/users', { method: 'PATCH', body: { id: 'user-gerente-it', permissions: recortado } })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.deepEqual([...result.payload.effectivePermissions].sort(), [...recortado].sort())

const gerenteRecortado = await loginSeller('user-gerente-it', '2468')
assert.equal(gerenteRecortado.user.permissions.includes('marketing:manage'), false, 'La sesión debe traer el permiso ya recortado.')
assert.equal(gerenteRecortado.user.permissions.includes('finance:read'), true)

result = await request('/api/marketing/campaigns', { token: gerenteRecortado.token })
assert.equal(result.status, 403, 'Sin marketing:manage la campaña queda vedada aunque el rol sea gerente.')
result = await request('/api/message-templates', { method: 'POST', body: {}, token: gerenteRecortado.token })
assert.equal(result.status, 403, 'Sin marketing:manage tampoco se editan plantillas.')
result = await request('/api/finance', { token: gerenteRecortado.token })
assert.equal(result.status, 200, 'El resto de los permisos de gerencia sigue vigente.')

// Restaurar: `null` vuelve a la base del rol (sin gastar otro login: el
// `effectivePermissions` que lee la UI ya lo demuestra).
result = await request('/api/users', { method: 'PATCH', body: { id: 'user-gerente-it', permissions: null } })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.effectivePermissions.includes('marketing:manage'), true, 'La base del rol vuelve al restaurar.')
result = await request('/api/users')
const gerenteListado = (result.payload || []).find(user => user.id === 'user-gerente-it')
assert.equal(gerenteListado?.effectivePermissions?.includes('marketing:manage'), true)

// El recorte no concede: un vendedor creado con el catálogo completo (y los
// permisos de gerencia incluidos) se queda, como máximo, con la base de su rol.
result = await request('/api/users', {
  method: 'POST',
  body: { name: 'Permisos IT', pin: '9753', role: 'VENDEDOR', permissions: [...new Set([...porRol('VENDEDOR'), ...recortado])] },
})
assert.equal(result.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.effectivePermissions.includes('team:manage'), false, 'Recortar no puede conceder team:manage a un vendedor.')
assert.equal(result.payload.effectivePermissions.includes('finance:read'), false, 'Recortar no puede conceder finance:read a un vendedor.')
assert.deepEqual([...result.payload.effectivePermissions].sort(), [...porRol('VENDEDOR')].sort())
result = await request('/api/users', { method: 'PATCH', body: { id: result.payload.id, status: 'INACTIVE' } })
assert.equal(result.status, 200, JSON.stringify(result.payload))

console.log('permissions-http: OK (catálogo, matriz por rol de los grupos migrados y recorte efectivo por integrante aplicado en las rutas).')
