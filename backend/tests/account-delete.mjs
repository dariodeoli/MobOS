#!/usr/bin/env node

// Borrar mi cuenta (DELETE /api/me): reautenticación, dueño bloqueado (409),
// desvinculación y anonimización del integrante, ventas conservadas, sesiones
// revocadas, auditoría y límite por IP. Empresas propias (del-*-it) e IPs propias.
// Uso: account-delete.mjs <baseUrl> <databaseUrl> [pgBin]

import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import bcrypt from 'bcryptjs'

const [base, databaseUrl, pgBin = '/opt/homebrew/bin'] = process.argv.slice(2)
if (!base || !databaseUrl) throw new Error('Uso: account-delete.mjs <baseUrl> <databaseUrl> [pgBin]')
const sql = (text) => execFileSync(`${pgBin}/psql`, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', text], { encoding: 'utf8' }).trim()
const count = (text) => Number(sql(text))
const hashOf = (token) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('hex')
let ipCounter = 40
async function call(path, { method = 'GET', body, token, ip } = {}) {
  const headers = { 'x-forwarded-for': ip || `203.0.113.${ipCounter++}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json().catch(() => null) }
}
const del = (token, body, ip) => call('/api/me', { method: 'DELETE', token, body, ip })

const pinHash = await bcrypt.hash('2468', 10)
const pinHash2 = await bcrypt.hash('1357', 10)
const passwordHash = await bcrypt.hash('company-password-it', 10)
const seedSession = (id, tenantId, userId, accountId, token) => sql(`INSERT INTO "Session" ("id","tenantId","userId","accountId","level","deviceId","tokenHash","expiresAt") VALUES ('${id}','${tenantId}','${userId}',${accountId ? `'${accountId}'` : 'NULL'},'SELLER','del-seeded','${hashOf(token)}',CURRENT_TIMESTAMP + INTERVAL '1 day')`)

sql(`
INSERT INTO "Tenant" ("id","name","slug","email","passwordHash","updatedAt") VALUES ('del-a-it','Del Tienda A','del-a-it','del-owner@example.invalid','${passwordHash}',CURRENT_TIMESTAMP);
INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ('del-b-it','Del Tienda B','del-b-it',CURRENT_TIMESTAMP),('del-solo-it','Del Tienda Solo','del-solo-it',CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","tenantId","name","email","pinHash","role","status","updatedAt") VALUES
  ('del-owner','del-a-it','Del Dueño','del-owner@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('del-seller','del-a-it','Del Vendedor','del-seller@example.invalid','${pinHash2}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP),
  ('del-pinonly','del-a-it','Del Solo PIN','del-pinonly@example.invalid','${pinHash2}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP),
  ('del-b-admin','del-b-it','Del Admin B','del-b-admin@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP),
  ('del-b-seller','del-b-it','Del Vendedor B','del-seller@example.invalid','${pinHash2}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP),
  ('del-solo-admin','del-solo-it','Del Admin Solo','del-solo@example.invalid','${pinHash}','ADMIN','ACTIVE',CURRENT_TIMESTAMP);
INSERT INTO "Account" ("id","email","updatedAt") VALUES ('del-acc-owner','del-owner@example.invalid',CURRENT_TIMESTAMP),('del-acc-seller','del-seller@example.invalid',CURRENT_TIMESTAMP);
INSERT INTO "TenantMembership" ("id","accountId","tenantId","userId","role","updatedAt") VALUES
  ('del-mem-o','del-acc-owner','del-a-it','del-owner','OWNER',CURRENT_TIMESTAMP),
  ('del-mem-s-a','del-acc-seller','del-a-it','del-seller','MEMBER',CURRENT_TIMESTAMP),
  ('del-mem-s-b','del-acc-seller','del-b-it','del-b-seller','MEMBER',CURRENT_TIMESTAMP);
INSERT INTO "Order" ("id","tenantId","sellerId","orderNumber","subtotalPyg","totalPyg","updatedAt") VALUES ('del-order-1','del-a-it','del-seller','DEL-0001',100000,100000,CURRENT_TIMESTAMP);
INSERT INTO "WebPushSubscription" ("id","tenantId","userId","endpoint","p256dh","auth","updatedAt") VALUES ('del-push-1','del-a-it','del-seller','https://push.example.invalid/del-1','k','a',CURRENT_TIMESTAMP);
`)

const sellerToken = newToken()
const ownerToken = newToken()
seedSession('del-sess-seller', 'del-a-it', 'del-seller', 'del-acc-seller', sellerToken)
seedSession('del-sess-owner', 'del-a-it', 'del-owner', 'del-acc-owner', ownerToken)

assert.equal((await del(undefined, { pin: '1357' })).status, 401, 'sin sesión')
const required = await del(sellerToken, {})
assert.equal(required.status, 400)
assert.equal(required.body.code, 'REAUTH_REQUIRED')
const badPin = await del(sellerToken, { pin: '0000' })
assert.equal(badPin.status, 401)
assert.equal(badPin.body.code, 'REAUTH_FAILED')
assert.equal(count(`SELECT COUNT(*) FROM "User" WHERE "id" = 'del-seller' AND "status" = 'ACTIVE'`), 1, 'un PIN malo no borra nada')
const badPassword = await del(sellerToken, { password: 'company-password-it' })
assert.equal(badPassword.status, 401, 'la contraseña de la empresa solo vale para el ADMIN')

const ownerBlocked = await del(ownerToken, { pin: '2468' })
assert.equal(ownerBlocked.status, 409, JSON.stringify(ownerBlocked.body))
assert.equal(ownerBlocked.body.code, 'OWNER_MUST_TRANSFER_OR_DELETE_STORE')
assert.deepEqual(ownerBlocked.body.stores.map(store => store.id), ['del-a-it'])
assert.equal(count(`SELECT COUNT(*) FROM "User" WHERE "id" = 'del-owner' AND "status" = 'ACTIVE'`), 1)
const soloToken = newToken()
seedSession('del-sess-solo', 'del-solo-it', 'del-solo-admin', null, soloToken)
const soloBlocked = await del(soloToken, { pin: '2468' })
assert.equal(soloBlocked.status, 409, 'único administrador sin cuenta tampoco puede dejar la tienda huérfana')
assert.equal(soloBlocked.body.code, 'OWNER_MUST_TRANSFER_OR_DELETE_STORE')

const deleted = await del(sellerToken, { pin: '1357' })
assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
for (const userId of ['del-seller', 'del-b-seller']) {
  assert.equal(sql(`SELECT "name" || '|' || COALESCE("email",'-') || '|' || "status" FROM "User" WHERE "id" = '${userId}'`), 'Usuario eliminado|-|INACTIVE', `${userId} anonimizado`)
}
assert.equal(count(`SELECT COUNT(*) FROM "Account" WHERE "id" = 'del-acc-seller'`), 0, 'la cuenta se elimina')
assert.equal(count(`SELECT COUNT(*) FROM "TenantMembership" WHERE "accountId" = 'del-acc-seller'`), 0)
assert.equal(count(`SELECT COUNT(*) FROM "WebPushSubscription" WHERE "userId" = 'del-seller'`), 0, 'sus suscripciones push se eliminan')
assert.equal(count(`SELECT COUNT(*) FROM "Session" WHERE "userId" IN ('del-seller','del-b-seller') AND "revokedAt" IS NULL`), 0, 'sesiones revocadas')
assert.equal((await call('/api/mi-cuenta', { token: sellerToken })).status, 401, 'el token deja de servir')
assert.equal(sql(`SELECT u."name" FROM "Order" o JOIN "User" u ON u."id" = o."sellerId" WHERE o."id" = 'del-order-1'`), 'Usuario eliminado', 'la venta se conserva con el vendedor anonimizado')
assert.equal(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'ACCOUNT_DELETED_SELF' AND "entityId" IN ('del-seller','del-b-seller')`), 2, 'auditado en cada tienda')
assert.equal(count(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'ACCOUNT_DELETED_SELF' AND "metadata"::text LIKE '%example.invalid%'`), 0, 'la auditoría no guarda datos personales')
assert.equal(count(`SELECT COUNT(*) FROM "User" WHERE "id" IN ('del-owner','del-b-admin') AND "status" = 'ACTIVE'`), 2, 'el resto del equipo no se toca')

const pinOnlyToken = newToken()
seedSession('del-sess-pinonly', 'del-a-it', 'del-pinonly', null, pinOnlyToken)
assert.equal((await del(pinOnlyToken, { pin: '1357' })).status, 200)
assert.equal(sql(`SELECT "name" || '|' || "status" FROM "User" WHERE "id" = 'del-pinonly'`), 'Usuario eliminado|INACTIVE')

const statuses = []
for (let index = 0; index < 7; index += 1) statuses.push((await del(undefined, { pin: '1357' }, '203.0.113.250')).status)
assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429], 'DELETE /api/me está limitado por IP antes de consultar la base')

console.log('account-delete: reautenticación, dueño bloqueado, anonimización, ventas conservadas, sesiones y límite OK')
