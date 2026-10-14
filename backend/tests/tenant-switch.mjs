#!/usr/bin/env node

// Multi-empresa (#377, WU2): cambio de empresa, listado, alta de empresa,
// revocación de pertenencias y pruebas de seguridad 1-8 del plan. Usa empresas
// propias (mt-*-it) y su propia IP (x-forwarded-for) para no tocar las sesiones
// ni las cuotas de otros tests. Uso: tenant-switch.mjs <baseUrl> <databaseUrl> [pgBin]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import bcrypt from 'bcryptjs'

const [base, databaseUrl, pgBin = '/opt/homebrew/bin'] = process.argv.slice(2)
if (!base || !databaseUrl) throw new Error('Uso: tenant-switch.mjs <baseUrl> <databaseUrl> [pgBin]')

const ORIGIN = 'https://app.moboss.online'
const IP = '203.0.113.77'
const COMPANY = 'mobos_company_session'
const SELLER = 'mobos_seller_session'
const sql = (text) => execFileSync(`${pgBin}/psql`, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', text], { encoding: 'utf8' }).trim()
const count = (text) => Number(sql(text))

async function call(path, { method = 'GET', body, token, cookies, headers = {} } = {}) {
  const finalHeaders = { 'x-forwarded-for': IP, ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  if (token) finalHeaders.Authorization = `Bearer ${token}`
  if (cookies) {
    finalHeaders.Cookie = Object.entries(cookies).filter(([, value]) => value).map(([name, value]) => `${name}=${value}`).join('; ')
    finalHeaders.Origin = headers.Origin ?? ORIGIN
  }
  const response = await fetch(`${base}${path}`, { method, headers: finalHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const set = {}
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const index = pair.indexOf('=')
    set[pair.slice(0, index)] = pair.slice(index + 1)
  }
  return { status: response.status, body: await response.json().catch(() => null), set, headers: response.headers }
}

const pinHash = await bcrypt.hash('2468', 10)
const pinHash2 = await bcrypt.hash('1357', 10)
const passwordHash = await bcrypt.hash('company-password-it', 10)
const stamp = Date.now().toString(36)

// ── Siembra ──
sql(`
INSERT INTO "Tenant" ("id","name","slug","email","passwordHash","updatedAt") VALUES
  ('mt-a-it','MT Empresa A','mt-a-it','mt-a-it@example.invalid','${passwordHash}',CURRENT_TIMESTAMP),
  ('mt-x-it','MT Empresa X','mt-x-it','mt-x-it@example.invalid','${passwordHash}',CURRENT_TIMESTAMP),
  ('mt-m-it','MT Empresa M','mt-m-it',NULL,NULL,CURRENT_TIMESTAMP),
  ('mt-rev-it','MT Revocada','mt-rev-it',NULL,NULL,CURRENT_TIMESTAMP),
  ('mt-bad-it','MT Vinculo ajeno','mt-bad-it',NULL,NULL,CURRENT_TIMESTAMP),
  ('mt-stale-new-it','MT Correo reutilizado','mt-stale-new-it','mt-stale-it@example.invalid','${passwordHash}',CURRENT_TIMESTAMP),
  ('mt-g2-it','MT Correo de cuenta Google','mt-g2-it','mt-g-it@example.invalid','${passwordHash}',CURRENT_TIMESTAMP);
INSERT INTO "Tenant" ("id","name","slug","archivedAt","updatedAt") VALUES ('mt-arch-it','MT Archivada','mt-arch-it',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","tenantId","name","email","pinHash","role","status","updatedAt") VALUES
  ('mt-a-admin','mt-a-it','MT Admin A','mt-a-it@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-a-seller','mt-a-it','MT Vendedor A','mt-a-seller@example.invalid','${pinHash2}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-x-admin','mt-x-it','MT Admin X','mt-x-it@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-m-admin','mt-m-it','MT Admin M','mt-m-admin@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-m-seller','mt-m-it','MT Vendedor M','mt-m-seller@example.invalid','${pinHash2}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-rev-admin','mt-rev-it','MT Admin Rev','mt-rev@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-bad-admin','mt-bad-it','MT Admin Bad','mt-bad@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-arch-admin','mt-arch-it','MT Admin Arch','mt-arch@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP);
INSERT INTO "Product" ("id","tenantId","sku","name","category","pricePyg","stock","isActive","updatedAt") VALUES
  ('mt-prod-a','mt-a-it','MT-SKU-A-${stamp}','MT Producto A','Test',100000,50,true,CURRENT_TIMESTAMP);
INSERT INTO "Branch" ("id","tenantId","name","updatedAt") VALUES ('mt-branch-x','mt-x-it','Sucursal X',CURRENT_TIMESTAMP);
`)

// ── Login y PIN: la cuenta y la pertenencia nacen en la misma transacción ──
const login = await call('/api/auth/login', { method: 'POST', body: { email: 'mt-a-it@example.invalid', password: 'company-password-it', deviceId: 'mt-device' } })
assert.equal(login.status, 200, JSON.stringify(login.body))
let companyToken = login.set[COMPANY]
assert.ok(companyToken)
const accountId = sql(`SELECT "id" FROM "Account" WHERE "email" = 'mt-a-it@example.invalid'`)
assert.ok(accountId, 'el login crea la cuenta de la empresa')
assert.equal(sql(`SELECT "role" || ':' || COALESCE("userId",'-') FROM "TenantMembership" WHERE "accountId" = '${accountId}' AND "tenantId" = 'mt-a-it'`), 'OWNER:mt-a-admin', 'OWNER vinculado al ADMIN de esa empresa')
assert.ok(count(`SELECT COUNT(*) FROM "Session" WHERE "accountId" = '${accountId}' AND "level" = 'COMPANY'`) >= 1, 'la sesión de empresa lleva la cuenta')

const pinAdmin = await call('/api/auth/pin', { method: 'POST', token: companyToken, body: { sellerId: 'mt-a-admin', pin: '2468' } })
assert.equal(pinAdmin.status, 200, JSON.stringify(pinAdmin.body))
let sellerToken = pinAdmin.set[SELLER]
// Un compañero con su PIN no hereda la cuenta: su sesión de vendedor no lleva accountId.
const pinSeller = await call('/api/auth/pin', { method: 'POST', token: companyToken, body: { sellerId: 'mt-a-seller', pin: '1357' } })
assert.equal(pinSeller.status, 200, JSON.stringify(pinSeller.body))
const coworkerToken = pinSeller.set[SELLER]

// ── Pertenencias sembradas para los casos de rechazo ──
const membership = (id, tenantId, userId, role, revoked = false) => `INSERT INTO "TenantMembership" ("id","accountId","tenantId","userId","role","revokedAt","updatedAt") VALUES ('${id}','${accountId}','${tenantId}',${userId ? `'${userId}'` : 'NULL'},'${role}',${revoked ? 'CURRENT_TIMESTAMP' : 'NULL'},CURRENT_TIMESTAMP);`
sql([
  membership('mt-mem-m', 'mt-m-it', 'mt-m-seller', 'MEMBER'),
  membership('mt-mem-rev', 'mt-rev-it', 'mt-rev-admin', 'ADMIN', true),
  membership('mt-mem-arch', 'mt-arch-it', 'mt-arch-admin', 'ADMIN'),
  // Test 5: el perfil vinculado es de OTRA empresa (corrupción) → se rechaza.
  membership('mt-mem-bad', 'mt-bad-it', 'mt-x-admin', 'ADMIN'),
].join('\n'))

// ── GET /api/auth/tenants ──
const lista = await call('/api/auth/tenants', { token: sellerToken })
assert.equal(lista.status, 200, JSON.stringify(lista.body))
assert.deepEqual(lista.body.tenants.map((t) => t.id).sort(), ['mt-a-it', 'mt-bad-it', 'mt-m-it'], 'solo pertenencias activas de empresas no archivadas')
assert.equal(lista.body.tenants.find((t) => t.id === 'mt-a-it').current, true)
assert.equal(lista.body.tenants.find((t) => t.id === 'mt-m-it').role, 'MEMBER')
assert.equal(lista.body.canCreate, true)
assert.equal((await call('/api/auth/tenants', { token: coworkerToken })).status, 401, 'la sesión de un compañero sola no tiene cuenta')
assert.equal((await call('/api/auth/tenants', { cookies: { [COMPANY]: companyToken, [SELLER]: coworkerToken } })).status, 200, 'con la sesión de empresa del dispositivo sí resuelve la cuenta')

// ── Test 1 y 5: cambio a no miembro / revocada / archivada / inexistente / vínculo ajeno → 403 sin sesión, con auditoría ──
const sesionesAntes = count(`SELECT COUNT(*) FROM "Session"`)
const deniedAntes = count(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'mt-a-it' AND "action" = 'TENANT_SWITCH_DENIED'`)
const switchCookies = () => ({ [COMPANY]: companyToken, [SELLER]: sellerToken })
for (const objetivo of ['mt-x-it', 'mt-rev-it', 'mt-arch-it', 'mt-no-existe-it', 'mt-bad-it', '']) {
  const rechazado = await call('/api/auth/switch-tenant', { method: 'POST', cookies: switchCookies(), body: { tenantId: objetivo } })
  assert.equal(rechazado.status, 403, `cambio a «${objetivo}» debe rechazarse: ${JSON.stringify(rechazado.body)}`)
  assert.equal(Object.keys(rechazado.set).length, 0, 'un rechazo no emite cookies ni sesión')
}
assert.equal(count(`SELECT COUNT(*) FROM "Session"`), sesionesAntes, 'los rechazos no crean sesiones')
assert.equal(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'mt-a-it' AND "action" = 'TENANT_SWITCH_DENIED'`) - deniedAntes, 6, 'cada rechazo queda auditado')
assert.ok(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'mt-a-it' AND "action" = 'TENANT_SWITCH_DENIED' AND "metadata"->>'reason' = 'invalid_link'`) >= 1, 'el vínculo de otra empresa se rechaza con su motivo')
assert.equal((await call('/api/auth/me', { token: sellerToken })).status, 200, 'tras los rechazos la sesión sigue intacta')
// Sin origen válido, la cookie no cambia de empresa.
assert.equal((await call('/api/auth/switch-tenant', { method: 'POST', cookies: switchCookies(), headers: { Origin: 'https://otro.example' }, body: { tenantId: 'mt-m-it' } })).status, 403)

// ── Test 2: x-tenant-id y tenantId del cuerpo se ignoran; CORS ya no lo admite ──
const espiado = await call('/api/auth/me', { token: sellerToken, headers: { 'x-tenant-id': 'mt-x-it' } })
assert.equal(espiado.body.tenant.id, 'mt-a-it', 'x-tenant-id no cambia el tenant de la sesión')
const preflight = await call('/api/auth/switch-tenant', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-tenant-id' } })
assert.ok(!/x-tenant-id/i.test(preflight.headers.get('access-control-allow-headers') || ''), 'x-tenant-id ya no está en el CORS')
const producto = (extra = {}) => ({ items: [{ productId: 'mt-prod-a', description: 'MT Producto A', quantity: 1, unitPricePyg: 100000 }], ...extra })
const conTenantAjeno = await call('/api/orders', { method: 'POST', token: sellerToken, headers: { 'x-tenant-id': 'mt-x-it' }, body: producto({ orderNumber: `MT-SPOOF-${stamp}`, tenantId: 'mt-x-it', branchId: 'mt-branch-x' }) })
assert.equal(conTenantAjeno.status, 201, JSON.stringify(conTenantAjeno.body))
assert.equal(conTenantAjeno.body.tenantId, 'mt-a-it', 'tenantId del cuerpo ignorado')
assert.notEqual(conTenantAjeno.body.branchId, 'mt-branch-x', 'una sucursal de otra empresa nunca se usa')

// ── Pedido encolado en otra empresa: 409 (el servidor lo garantiza) ──
const colaAjena = await call('/api/orders', { method: 'POST', token: sellerToken, body: producto({ orderNumber: `MT-QX-${stamp}`, queuedTenantId: 'mt-x-it', offline: true }) })
assert.equal(colaAjena.status, 409, JSON.stringify(colaAjena.body))
assert.equal(colaAjena.body.details?.code, 'TENANT_MISMATCH')
assert.equal(count(`SELECT COUNT(*) FROM "Order" WHERE "orderNumber" = 'MT-QX-${stamp}'`), 0, 'no se creó el pedido')
const colaPropia = await call('/api/orders', { method: 'POST', token: sellerToken, body: producto({ orderNumber: `MT-QA-${stamp}`, queuedTenantId: 'mt-a-it', offline: true }) })
assert.equal(colaPropia.status, 201, JSON.stringify(colaPropia.body))

// ── Invitación aceptada con sesión de cuenta → pertenencia MEMBER ──
const tokenInv = `${stamp}`.padEnd(64, 'e')
sql(`INSERT INTO "UserInvitation" ("id","tenantId","email","name","role","inviterId","tokenHash","expiresAt","sentAt","resendAvailableAt","updatedAt") VALUES ('mt-inv-x','mt-x-it','mt-a-it@example.invalid','MT Invitado','VENDEDOR','mt-x-admin','${tokenInv}',CURRENT_TIMESTAMP + INTERVAL '7 days',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
const aceptada = await call('/api/user-invitations/accept-by-id', { method: 'POST', token: sellerToken, body: { id: 'mt-inv-x', pin: '4680', deviceId: 'mt-device' } })
assert.equal(aceptada.status, 201, JSON.stringify(aceptada.body))
assert.equal(sql(`SELECT "role" || ':' || COALESCE("userId",'-') || ':' || (SELECT "tenantId" FROM "User" WHERE "id" = "TenantMembership"."userId") FROM "TenantMembership" WHERE "accountId" = '${accountId}' AND "tenantId" = 'mt-x-it'`), `MEMBER:${aceptada.body.user.id}:mt-x-it`, 'la invitación crea una pertenencia MEMBER con el perfil de ESA empresa')

// ── Tests 3 y 7: cambio válido A → M ──
const cambio = await call('/api/auth/switch-tenant', { method: 'POST', cookies: switchCookies(), headers: { 'x-tenant-id': 'mt-x-it' }, body: { tenantId: 'mt-m-it', tenant: 'mt-x-it' } })
assert.equal(cambio.status, 200, JSON.stringify(cambio.body))
assert.equal(cambio.body.tenant.id, 'mt-m-it')
assert.deepEqual(cambio.body.sellers.map((s) => s.id).sort(), ['mt-m-admin', 'mt-m-seller'], 'la lista de vendedores es solo la de la empresa destino')
assert.equal(cambio.body.user.id, 'mt-m-seller', 'quien cambia es el perfil vinculado: entra con su vendedor')
assert.ok(cambio.set[COMPANY] && cambio.set[SELLER])
assert.equal((await call('/api/auth/me', { token: sellerToken })).status, 401, 'el Bearer viejo no se puede repetir')
assert.equal((await call('/api/products', { token: sellerToken })).status, 401)
assert.equal((await call('/api/auth/pin', { method: 'POST', token: companyToken, body: { sellerId: 'mt-a-admin', pin: '2468' } })).status, 401, 'la sesión de empresa vieja también cayó')
assert.equal((await call('/api/auth/me', { cookies: switchCookies() })).status, 401, 'las cookies viejas dan 401')
companyToken = cambio.set[COMPANY]; sellerToken = cambio.set[SELLER]
const enM = await call('/api/auth/me', { token: sellerToken })
assert.equal(enM.status, 200); assert.equal(enM.body.tenant.id, 'mt-m-it')
assert.equal(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'TENANT_SWITCH_OUT' AND "tenantId" = 'mt-a-it'`) >= 1, true)
assert.equal(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'TENANT_SWITCH_IN' AND "tenantId" = 'mt-m-it'`) >= 1, true)
assert.equal((await call('/api/products', { token: sellerToken })).body.some((p) => p.id === 'mt-prod-a'), false, 'nada de A queda visible en M')

// ── Test 8a: un MEMBER no crea empresas ──
const tenantsAntes = count(`SELECT COUNT(*) FROM "Tenant"`)
const miembroOk = await call('/api/auth/companies', { method: 'POST', cookies: { [COMPANY]: companyToken, [SELLER]: sellerToken }, body: { companyName: 'MT No debería' } })
assert.equal(miembroOk.status, 403, JSON.stringify(miembroOk.body))
assert.equal(count(`SELECT COUNT(*) FROM "Tenant"`), tenantsAntes)

// ── Regla del PIN: de vuelta a A (perfil vinculado → vendedor); con un compañero → pantalla de PIN ──
const vuelta = await call('/api/auth/switch-tenant', { method: 'POST', cookies: { [COMPANY]: companyToken, [SELLER]: sellerToken }, body: { tenantId: 'mt-a-it' } })
assert.equal(vuelta.status, 200, JSON.stringify(vuelta.body))
assert.equal(vuelta.body.user.id, 'mt-a-admin')
companyToken = vuelta.set[COMPANY]
const pinCompanero = await call('/api/auth/pin', { method: 'POST', token: companyToken, body: { sellerId: 'mt-a-seller', pin: '1357' } })
assert.equal(pinCompanero.status, 200)
const sinPin = await call('/api/auth/switch-tenant', { method: 'POST', cookies: { [COMPANY]: companyToken, [SELLER]: pinCompanero.set[SELLER] }, body: { tenantId: 'mt-m-it' } })
assert.equal(sinPin.status, 200, JSON.stringify(sinPin.body))
assert.equal(sinPin.body.user, null, 'un compañero que cambia no hereda el vendedor vinculado')
assert.equal(sinPin.set[SELLER], '', 'se limpia la cookie de vendedor: la app muestra el PIN')
assert.ok(sinPin.body.sellers.length >= 1)
const regreso = await call('/api/auth/switch-tenant', { method: 'POST', cookies: { [COMPANY]: sinPin.set[COMPANY] }, body: { tenantId: 'mt-a-it' } })
assert.equal(regreso.status, 200)
companyToken = regreso.set[COMPANY]
sellerToken = (await call('/api/auth/pin', { method: 'POST', token: companyToken, body: { sellerId: 'mt-a-admin', pin: '2468' } })).set[SELLER]
assert.ok(sellerToken)

// ── Test 8b: alta de empresa propia con límite 429 ──
const alta = await call('/api/auth/companies', { method: 'POST', cookies: { [COMPANY]: companyToken, [SELLER]: sellerToken }, body: { companyName: `MT Nueva ${stamp}` } })
assert.equal(alta.status, 201, JSON.stringify(alta.body))
assert.equal(alta.body.onboardingRequired, true)
assert.equal(alta.body.user, null)
assert.equal(alta.set[SELLER], '')
const nuevaId = alta.body.tenant.id
assert.equal(sql(`SELECT COALESCE("email",'null') || ':' || ("settings"->'onboarding'->>'adminPinPending') FROM "Tenant" WHERE "id" = '${nuevaId}'`), 'null:true', 'empresa sin correo y con alta de PIN pendiente')
assert.equal(sql(`SELECT m."role" || ':' || (u."tenantId" = m."tenantId")::text || ':' || u."role" FROM "TenantMembership" m JOIN "User" u ON u."id" = m."userId" WHERE m."accountId" = '${accountId}' AND m."tenantId" = '${nuevaId}'`), 'OWNER:true:ADMIN')
const adminNuevo = sql(`SELECT "id" FROM "User" WHERE "tenantId" = '${nuevaId}'`)
assert.equal((await call('/api/auth/pin', { method: 'POST', token: alta.set[COMPANY], body: { sellerId: adminNuevo, pin: '2468' } })).status, 401, 'el PIN inicial del ADMIN es inutilizable')
assert.ok(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = '${nuevaId}' AND "action" = 'TENANT_COMPANY_CREATED'`) === 1)
let actual = alta.set[COMPANY]
for (const n of [2, 3]) {
  const otra = await call('/api/auth/companies', { method: 'POST', cookies: { [COMPANY]: actual }, body: { companyName: `MT Nueva ${stamp} ${n}` } })
  assert.equal(otra.status, 201, JSON.stringify(otra.body))
  actual = otra.set[COMPANY]
}
const limitada = await call('/api/auth/companies', { method: 'POST', cookies: { [COMPANY]: actual }, body: { companyName: `MT Nueva ${stamp} 4` } })
assert.equal(limitada.status, 429, JSON.stringify(limitada.body))
assert.ok(limitada.headers.get('retry-after'))
assert.equal((await call('/api/auth/companies', { method: 'POST', cookies: { [COMPANY]: actual }, body: { companyName: '' } })).status, 400)

// ── Test 4: pertenencia revocada → la siguiente solicitud falla ──
const volverA = await call('/api/auth/switch-tenant', { method: 'POST', cookies: { [COMPANY]: actual }, body: { tenantId: 'mt-a-it' } })
assert.equal(volverA.status, 200, JSON.stringify(volverA.body))
const pinFinal = await call('/api/auth/pin', { method: 'POST', token: volverA.set[COMPANY], body: { sellerId: 'mt-a-admin', pin: '2468' } })
const revocadoToken = pinFinal.set[SELLER]
assert.equal((await call('/api/auth/me', { token: revocadoToken })).status, 200)
sql(`UPDATE "TenantMembership" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "accountId" = '${accountId}' AND "tenantId" = 'mt-a-it'`)
assert.equal((await call('/api/auth/me', { token: revocadoToken })).status, 401, 'revocada la pertenencia, la sesión de vendedor cae')
assert.equal((await call('/api/auth/pin', { method: 'POST', token: volverA.set[COMPANY], body: { sellerId: 'mt-a-admin', pin: '2468' } })).status, 401, 'y la de empresa también')
assert.equal((await call('/api/auth/tenants', { token: revocadoToken })).status, 401)
// El login con la contraseña de la empresa sigue (credencial compartida), pero sin cuenta y sin revivir la pertenencia.
const reloginRevocado = await call('/api/auth/login', { method: 'POST', body: { email: 'mt-a-it@example.invalid', password: 'company-password-it', deviceId: 'mt-device-2' } })
assert.equal(reloginRevocado.status, 200)
assert.equal(sql(`SELECT COALESCE("accountId",'sin-cuenta') FROM "Session" ORDER BY "createdAt" DESC LIMIT 1`), 'sin-cuenta')
assert.equal(sql(`SELECT ("revokedAt" IS NOT NULL)::text FROM "TenantMembership" WHERE "accountId" = '${accountId}' AND "tenantId" = 'mt-a-it'`), 'true', 'la contraseña no revive una pertenencia revocada')
assert.equal((await call('/api/auth/tenants', { token: reloginRevocado.set[COMPANY] })).status, 401, 'sin cuenta no hay cambio de empresa')

// ── Test 6: el correo solo nunca vincula ──
sql(`
INSERT INTO "Account" ("id","email","updatedAt") VALUES ('mt-acc-stale','mt-stale-it@example.invalid',CURRENT_TIMESTAMP);
INSERT INTO "TenantMembership" ("id","accountId","tenantId","userId","role","updatedAt") VALUES ('mt-mem-stale','mt-acc-stale','mt-x-it','mt-x-admin','OWNER',CURRENT_TIMESTAMP);
INSERT INTO "Account" ("id","email","googleSubject","updatedAt") VALUES ('mt-acc-g','mt-g-it@example.invalid','mt-google-subject-it',CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","tenantId","name","email","pinHash","role","status","updatedAt") VALUES
  ('mt-new-admin','mt-stale-new-it','MT Admin Nuevo','mt-stale-it@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('mt-g2-admin','mt-g2-it','MT Admin G2','mt-g-it@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP);
`)
for (const [email, tenantId] of [['mt-stale-it@example.invalid', 'mt-stale-new-it'], ['mt-g-it@example.invalid', 'mt-g2-it']]) {
  const entrada = await call('/api/auth/login', { method: 'POST', body: { email, password: 'company-password-it', deviceId: `mt-${tenantId}` } })
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body))
  assert.equal(count(`SELECT COUNT(*) FROM "TenantMembership" WHERE "tenantId" = '${tenantId}'`), 0, `la empresa ${tenantId} no heredó la cuenta ajena por el correo`)
  assert.equal(sql(`SELECT COALESCE("accountId",'sin-cuenta') FROM "Session" WHERE "tenantId" = '${tenantId}' ORDER BY "createdAt" DESC LIMIT 1`), 'sin-cuenta')
  assert.equal((await call('/api/auth/tenants', { token: entrada.set[COMPANY] })).status, 401)
}
assert.equal(count(`SELECT COUNT(*) FROM "TenantMembership" WHERE "accountId" IN ('mt-acc-stale','mt-acc-g')`), 1, 'las cuentas ajenas conservan solo lo suyo')

console.log('tenant-switch: checks OK (pruebas de seguridad 1-8: cambio válido/rechazado con auditoría, x-tenant-id ignorado, cookies y Bearer viejos caen, revocación inmediata, vínculo ajeno rechazado, correo sin prueba no vincula, vendedores del destino, alta con 429 y MEMBER sin alta; invitación → MEMBER; pedido encolado de otra empresa → 409).')
