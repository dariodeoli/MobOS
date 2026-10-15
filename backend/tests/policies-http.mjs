import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'

// Solo fixture sintética local, creada por integration-http.sh. No OAuth simulado
// como prueba real: aquí se prueba exclusivamente la autorización y API de políticas.
const [base, admin, seller, adminOther, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !seller || !adminOther || !databaseUrl) throw new Error('Uso: policies-http.mjs <base> <admin> <seller> <adminOtraEmpresa> <dbSintetica>')
const target = new URL(databaseUrl)
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^mobos_(it|e2e|finanzas393)/.test(target.pathname.slice(1))) throw new Error('La fixture exige una base local aislada de pruebas.')
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const hash = token => createHash('sha256').update(token).digest('hex')
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
let checks = 0
async function req(path, { token, method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const accountId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID(), foreignSessionId = randomUUID()
const ownerToken = randomBytes(32).toString('hex'), foreignToken = randomBytes(32).toString('hex')
let owner, other, before
try {
  owner = await one(`SELECT s."tenantId", s."userId", t."slug", t."settings" FROM "Session" s JOIN "Tenant" t ON t."id"=s."tenantId" WHERE s."tokenHash"=$1`, [hash(admin)])
  other = await one(`SELECT "tenantId", "userId" FROM "Session" WHERE "tokenHash"=$1`, [hash(adminOther)])
  assert.ok(owner?.userId && other?.userId && owner.tenantId !== other.tenantId)
  before = owner.settings
  await db.query(`INSERT INTO "Account" ("id","email","updatedAt") VALUES ($1,$2,now())`, [accountId, `policies-${accountId}@example.invalid`])
  await db.query(`INSERT INTO "TenantMembership" ("id","accountId","tenantId","userId","role","updatedAt") VALUES ($1,$2,$3,$4,'OWNER',now())`, [membershipId, accountId, owner.tenantId, owner.userId])
  for (const [id, token, fixture] of [[sessionId, ownerToken, owner], [foreignSessionId, foreignToken, other]]) {
    await db.query(`INSERT INTO "Session" ("id","tenantId","userId","accountId","level","deviceId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,'SELLER','policies-http-qa',$5,now()+interval '1 hour')`, [id, fixture.tenantId, fixture.userId, accountId, hash(token)])
  }
  const write = { content: 'Política QA de garantía de la tienda.', published: true }
  await req('/api/tenant/policies', { status: 401 })
  await req('/api/tenant/policies/garantia', { method: 'PUT', body: write, status: 401 })
  for (const token of [admin, seller, adminOther, foreignToken]) {
    await req('/api/tenant/policies', { token, status: 403 })
    await req('/api/tenant/policies/garantia', { token, method: 'PUT', body: write, status: 403 })
  }
  await req('/api/tenant/policies', { token: ownerToken })
  const foreignBefore = await one(`SELECT "settings" FROM "Tenant" WHERE "id"=$1`, [other.tenantId])
  const result = await req('/api/tenant/policies/garantia', { token: ownerToken, method: 'PUT', body: { ...write, tenantId: other.tenantId } })
  assert.ok(result.updatedAt)
  assert.deepEqual((await one(`SELECT "settings" FROM "Tenant" WHERE "id"=$1`, [other.tenantId])).settings, foreignBefore.settings, 'tenant del cuerpo no elige la tienda')
  await req('/api/tenant/policies/envios', { token: ownerToken, method: 'PUT', body: { content: 'BORRADOR_QA_INTERNO', published: false } })
  const audit = await one(`SELECT "userId","metadata" FROM "AuditLog" WHERE "tenantId"=$1 AND "action"='TENANT_POLICY_UPDATED' ORDER BY "createdAt" DESC LIMIT 1`, [owner.tenantId])
  assert.equal(audit.userId, owner.userId)
  assert.equal(audit.metadata.type, 'envios')
  const saved = (await one(`SELECT "settings" FROM "Tenant" WHERE "id"=$1`, [owner.tenantId])).settings
  for (const mutation of [
    { sql: `UPDATE "TenantMembership" SET "role"='MEMBER' WHERE "id"=$1` },
    { sql: `UPDATE "TenantMembership" SET "revokedAt"=now() WHERE "id"=$1` },
    { sql: `UPDATE "TenantMembership" SET "userId"=$2 WHERE "id"=$1`, user: other.userId },
  ]) {
    await db.query(mutation.sql, mutation.user ? [membershipId, mutation.user] : [membershipId])
    await req('/api/tenant/policies/garantia', { token: ownerToken, method: 'PUT', body: { content: 'NO_AUTORIZADO', published: true }, status: 403 })
    await db.query(`UPDATE "TenantMembership" SET "role"='OWNER',"revokedAt"=null,"userId"=$2 WHERE "id"=$1`, [membershipId, owner.userId])
  }
  assert.deepEqual((await one(`SELECT "settings" FROM "Tenant" WHERE "id"=$1`, [owner.tenantId])).settings, saved, 'rechazos no alteran texto')
  const publicIndex = await req(`/api/public/policies/${owner.slug}`)
  assert.deepEqual(Object.keys(publicIndex.company).sort(), ['address','city','department','email','logo','name','phone','slug'])
  assert.ok(publicIndex.policies.some(p => p.type === 'garantia'))
  assert.ok(!publicIndex.policies.some(p => p.type === 'envios'))
  assert.ok(!JSON.stringify(publicIndex).includes('BORRADOR_QA_INTERNO'))
  const publicPolicy = await req(`/api/public/policies/${owner.slug}/garantia`)
  assert.equal(publicPolicy.policy.content, write.content)
  await req(`/api/public/policies/${owner.slug}/envios`, { status: 404 })
  await req(`/api/public/policies/${owner.slug}/no-existe`, { status: 404 })
  await req('/api/public/policies/policies-qa-inexistente', { status: 404 })
  const print = await req('/api/tenant/policies/print', { token: seller })
  assert.equal(print.garantiaPublicada, true)
  assert.ok(!JSON.stringify(print).includes('BORRADOR_QA_INTERNO'))
  console.log(`Políticas HTTP (#433): ${checks} checks OK, dueño real/tenant/auditoría/público mínimo.`)
} finally {
  if (owner && before !== undefined) await db.query(`UPDATE "Tenant" SET "settings"=$2::jsonb WHERE "id"=$1`, [owner.tenantId, JSON.stringify(before)])
  await db.query(`DELETE FROM "Session" WHERE "id"=ANY($1::text[])`, [[sessionId, foreignSessionId]])
  await db.query(`DELETE FROM "TenantMembership" WHERE "id"=$1`, [membershipId])
  await db.query(`DELETE FROM "Account" WHERE "id"=$1`, [accountId])
  await db.end()
}
