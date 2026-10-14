// Prueba de la migración 20270104000000_tenant_membership (#377) contra Postgres real.
//
// Crea bases descartables en el servidor indicado y comprueba:
//  - la cadena completa aplica sobre una base vacía y es re-aplicable;
//  - sobre una base sembrada en la migración anterior, todo tenant no archivado
//    con correo+contraseña o con dueño Google recibe una membresía OWNER cuyo
//    userId pertenece a ESE tenant;
//  - el rol, la cuenta compartida por correo en otra capitalización y los
//    timestamps en UTC salen como corresponde;
//  - correr la migración otra vez cambia 0 filas.
//
// Uso: TENANT_MEMBERSHIP_PG_URL=postgresql://user@127.0.0.1:55891 node tests/tenant-membership-migration.mjs
// (URL del servidor SIN nombre de base; las bases temporales se borran al final.)
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const server = process.env.TENANT_MEMBERSHIP_PG_URL
if (!server) {
  console.error('Falta TENANT_MEMBERSHIP_PG_URL (servidor Postgres de prueba, sin base).')
  process.exit(2)
}
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')
const NEW = '20270104000000_tenant_membership'
const names = readdirSync(migrationsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
if (names[names.length - 1] !== NEW) throw new Error(`La migración ${NEW} debe ser la última (hay ${names[names.length - 1]}).`)
const sql = name => readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8')

const stamp = Date.now().toString(36)
const admin = new pg.Client({ connectionString: `${server}/postgres` })
const dbs = []
let checks = 0
const ok = (condition, label) => {
  if (!condition) throw new Error(`FALLÓ: ${label}`)
  checks += 1
  console.log(`ok · ${label}`)
}

async function scratch(label) {
  const name = `tenant_mem_${label}_${stamp}`
  await admin.query(`CREATE DATABASE "${name}"`)
  dbs.push(name)
  const client = new pg.Client({ connectionString: `${server}/${name}` })
  await client.connect()
  return client
}

async function seed(db) {
  const tenant = (id, email, password, archived = false) => db.query(
    `INSERT INTO "Tenant" ("id","name","slug","email","passwordHash","archivedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [id, `Empresa ${id}`, `${id}-${stamp}`, email, password ? 'hash' : null, archived ? new Date('2026-05-01T00:00:00Z') : null])
  const user = (id, tenantId, role, email, status, created) => db.query(
    `INSERT INTO "User" ("id","tenantId","name","email","role","status","pinHash","createdAt","updatedAt") VALUES ($1,$2,$1,$3,$4::"UserRole",$5::"UserStatus",'x',$6,now())`,
    [id, tenantId, email, role, status, created])

  await tenant('t-email', 'Dueno@Example.com', true)          // correo+contraseña, mayúsculas
  await tenant('t-email2', 'dueno@example.com', true)         // mismo correo en minúsculas: misma cuenta
  await tenant('t-google', null, false)                       // solo Google
  await tenant('t-both', 'both@example.com', true)            // correo y Google
  await tenant('t-nopass', 'nopass@example.com', false)       // correo sin contraseña: sin cuenta de correo
  await tenant('t-noadmin', 'noadmin@example.com', true)      // sin ADMIN: membresía sin userId
  await tenant('t-archived', 'arch@example.com', true, true)  // archivada
  await tenant('t-shared', null, false)                       // Google, dueño y colaborador

  // t-email: el ADMIN con el correo del tenant NO es el más antiguo.
  await user('u-email-old', 't-email', 'ADMIN', 'otro@example.com', 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-email-match', 't-email', 'ADMIN', 'dueno@EXAMPLE.com', 'ACTIVE', new Date('2026-02-01T00:00:00Z'))
  await user('u-email-vend', 't-email', 'VENDEDOR', 'dueno@example.com', 'ACTIVE', new Date('2025-12-01T00:00:00Z'))
  await user('u-email2', 't-email2', 'ADMIN', null, 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  // t-google: sin correo; solo el perfil marcado como creador de la tienda se vincula.
  await user('u-google-inactive', 't-google', 'ADMIN', null, 'INACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-google-b', 't-google', 'ADMIN', null, 'ACTIVE', new Date('2026-03-01T00:00:00Z'))
  await user('u-google-a', 't-google', 'ADMIN', null, 'ACTIVE', new Date('2026-02-01T00:00:00Z'))
  await user('u-both', 't-both', 'ADMIN', 'both@example.com', 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-nopass', 't-nopass', 'ADMIN', 'nopass@example.com', 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-noadmin-v', 't-noadmin', 'VENDEDOR', 'noadmin@example.com', 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-arch', 't-archived', 'ADMIN', 'arch@example.com', 'ACTIVE', new Date('2026-01-01T00:00:00Z'))
  await user('u-shared', 't-shared', 'ADMIN', null, 'ACTIVE', new Date('2026-01-01T00:00:00Z'))

  await db.query(`INSERT INTO "GoogleIdentity" ("subject","name") VALUES ('g-1','Persona Uno'),('g-2','Persona Dos'),('g-3','Sin acceso')`)
  await db.query(`INSERT INTO "GoogleStoreAccess" ("subject","tenantId","owner") VALUES
    ('g-1','t-google',true),('g-1','t-both',true),('g-1','t-shared',true),('g-2','t-shared',false)`)
  // t-google: el perfil que creó la tienda con Google (no es el más antiguo).
  await db.query(`INSERT INTO "AuditLog" ("id","tenantId","userId","action","entity") VALUES ('al-g-owner','t-google','u-google-a','GOOGLE_STORE_OWNER_CREATED','GoogleStoreAccess')`)
}

const rows = (db, text) => db.query(text).then(result => result.rows)
async function snapshot(db) {
  return JSON.stringify({
    accounts: await rows(db, `SELECT * FROM "Account" ORDER BY "id"`),
    memberships: await rows(db, `SELECT * FROM "TenantMembership" ORDER BY "id"`),
  })
}

try {
  await admin.connect()

  // ── Base vacía: la cadena completa aplica y es re-aplicable ──
  const vacia = await scratch('empty')
  for (const name of names) await vacia.query(sql(name))
  ok((await vacia.query(`SELECT count(*)::int AS n FROM "Account"`)).rows[0].n === 0, 'base vacía: la cadena completa aplica y no crea cuentas')
  ok((await vacia.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Session' AND column_name = 'accountId' AND is_nullable = 'YES'`)).rowCount === 1, 'base vacía: Session.accountId existe y es opcional')
  await vacia.query(sql(NEW))
  ok(true, 'base vacía: re-aplicar la migración no falla (idempotente)')
  await vacia.end()

  // ── Base en la migración anterior, con datos ──
  const previa = await scratch('prev')
  for (const name of names.filter(item => item !== NEW)) await previa.query(sql(name))
  await seed(previa)
  await previa.query(sql(NEW))

  const accounts = await rows(previa, `SELECT * FROM "Account"`)
  const byEmail = Object.fromEntries(accounts.filter(a => a.email).map(a => [a.email, a]))
  const bySubject = Object.fromEntries(accounts.filter(a => a.googleSubject).map(a => [a.googleSubject, a]))
  ok(accounts.length === 7, `cuentas: 3 Google + 4 correos distintos (hay ${accounts.length})`)
  ok(Object.keys(bySubject).sort().join() === 'g-1,g-2,g-3', 'una cuenta por GoogleIdentity (también la sin acceso)')
  ok(Object.keys(byEmail).sort().join() === 'arch@example.com,both@example.com,dueno@example.com,noadmin@example.com', 'cuentas de correo en minúsculas, sin la empresa sin contraseña')
  ok(accounts.every(a => (a.email === null) !== (a.googleSubject === null)), 'cada cuenta tiene correo o sujeto Google, nunca ambos')
  ok(accounts.every(a => a.email === null || a.email === a.email.toLowerCase()), 'todos los correos de cuenta están en minúsculas')

  const memberships = await rows(previa, `SELECT m.*, u."tenantId" AS "userTenantId" FROM "TenantMembership" m LEFT JOIN "User" u ON u."id" = m."userId"`)
  const mem = (account, tenantId) => memberships.find(m => m.accountId === account.id && m.tenantId === tenantId)

  // Todo tenant no archivado con correo+contraseña o dueño Google tiene OWNER.
  const sinOwner = await rows(previa, `
    SELECT t."id" FROM "Tenant" t
    WHERE t."archivedAt" IS NULL
      AND ((t."email" IS NOT NULL AND t."passwordHash" IS NOT NULL)
           OR EXISTS (SELECT 1 FROM "GoogleStoreAccess" a WHERE a."tenantId" = t."id" AND a."owner"))
      AND NOT EXISTS (SELECT 1 FROM "TenantMembership" m WHERE m."tenantId" = t."id" AND m."role" = 'OWNER')`)
  ok(sinOwner.length === 0, 'todo tenant no archivado con correo+contraseña o dueño Google tiene membresía OWNER')
  ok(memberships.every(m => m.userId === null || m.userTenantId === m.tenantId), 'el userId de cada membresía pertenece a ese mismo tenant')

  ok(mem(byEmail['dueno@example.com'], 't-email')?.role === 'OWNER' && mem(byEmail['dueno@example.com'], 't-email2')?.role === 'OWNER', 'correo en otra capitalización: una sola cuenta con OWNER en ambas empresas')
  ok(mem(byEmail['dueno@example.com'], 't-email').userId === 'u-email-match', 'userId = ADMIN activo con el correo del tenant, aunque no sea el más antiguo (ignora VENDEDOR)')
  ok(mem(byEmail['dueno@example.com'], 't-email2').userId === null, 'sin ADMIN con el mismo correo: userId nulo (pantalla de PIN), no el más antiguo')
  ok(mem(bySubject['g-1'], 't-google').userId === 'u-google-a', 'Google dueño: el perfil que creó la tienda (marca GOOGLE_STORE_OWNER_CREATED), no el más antiguo')
  ok(mem(bySubject['g-1'], 't-shared').userId === null && mem(bySubject['g-2'], 't-shared').userId === null, 'Google sin marca de creador, o no dueño: userId nulo')
  ok(mem(bySubject['g-1'], 't-google').role === 'OWNER' && mem(bySubject['g-1'], 't-shared').role === 'OWNER', 'GoogleStoreAccess.owner → OWNER')
  ok(mem(bySubject['g-2'], 't-shared').role === 'ADMIN', 'GoogleStoreAccess no dueño → ADMIN')
  ok(mem(bySubject['g-3'], 't-google') === undefined && memberships.filter(m => m.accountId === bySubject['g-3'].id).length === 0, 'identidad Google sin acceso: cuenta sin membresías')
  ok(mem(byEmail['both@example.com'], 't-both').role === 'OWNER' && mem(bySubject['g-1'], 't-both').role === 'OWNER', 'tenant con correo y Google: ambas cuentas son OWNER')
  ok(!byEmail['nopass@example.com'] && !memberships.some(m => m.tenantId === 't-nopass'), 'correo sin contraseña: no se crea cuenta ni membresía')
  ok(mem(byEmail['noadmin@example.com'], 't-noadmin').userId === null, 'tenant sin ADMIN: membresía OWNER con userId nulo (no se inventa)')
  ok(mem(byEmail['arch@example.com'], 't-archived')?.role === 'OWNER', 'tenant archivado conserva su membresía (restaurable)')
  ok(memberships.every(m => m.revokedAt === null && m.revokedReason === null && m.lastUsedAt === null), 'ninguna membresía nace revocada ni usada')
  ok(new Set(memberships.map(m => `${m.accountId}|${m.tenantId}`)).size === memberships.length, 'una sola membresía por (cuenta, tenant)')

  // Timestamps en UTC: el backfill coincide con la hora UTC del servidor, no con la local.
  const utc = (await previa.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`)).rows[0].now
  const maxSkew = Math.max(...[...accounts, ...memberships].flatMap(r => [r.createdAt, r.updatedAt]).map(d => Math.abs(d.getTime() - utc.getTime())))
  ok(maxSkew < 10 * 60 * 1000, `createdAt/updatedAt del backfill en UTC (desfase máx. ${maxSkew} ms)`)
  await previa.query(`SET TIME ZONE 'America/Asuncion'`)
  await previa.query(`DELETE FROM "TenantMembership"; DELETE FROM "Account"`)
  await previa.query(sql(NEW))
  const asu = await rows(previa, `SELECT "createdAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now FROM "Account" LIMIT 1`)
  ok(Math.abs(asu[0].createdAt.getTime() - asu[0].now.getTime()) < 10 * 60 * 1000, 'con la sesión en otra zona horaria el backfill sigue en UTC')
  await previa.query(`RESET TIME ZONE`)
  await previa.query(`DELETE FROM "TenantMembership"; DELETE FROM "Account"`)
  await previa.query(sql(NEW))

  // ── Segunda pasada: 0 filas cambian y lo editado a mano se respeta ──
  await previa.query(`UPDATE "TenantMembership" SET "role" = 'ADMIN', "revokedAt" = '2026-09-01T00:00:00Z' WHERE "tenantId" = 't-email'`)
  const antes = await snapshot(previa)
  const antesCount = (await previa.query(`SELECT (SELECT count(*) FROM "Account")::int AS a, (SELECT count(*) FROM "TenantMembership")::int AS m`)).rows[0]
  await previa.query(sql(NEW))
  const despues = await snapshot(previa)
  ok(antes === despues, 'segunda pasada de la migración: 0 filas cambian (y rol/revocación manual no se pisa)')
  ok(antesCount.a === 7 && antesCount.m === memberships.length, `segunda pasada: mismas ${antesCount.a} cuentas y ${antesCount.m} membresías`)
  await previa.end()

  console.log(`tenant-membership-migration: OK (${checks} comprobaciones)`)
} catch (error) {
  console.error(error?.message || error)
  process.exitCode = 1
} finally {
  for (const name of dbs) {
    try { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`) } catch (error) { console.error(`No se pudo borrar ${name}: ${error?.message || error}`) }
  }
  await admin.end()
}
