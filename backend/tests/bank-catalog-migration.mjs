// #363: SQL real sobre tablas TEMP de una conexión de prueba explícita.
// Nunca inspecciona ni modifica las tablas persistidas de la base.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.MOBOS_TEST_DATABASE_URL
if (!url) throw new Error('Indicá MOBOS_TEST_DATABASE_URL de una base de prueba local.')
const target = new URL(url)
if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/^\/mobos.*(?:test|ui_shared|e2e)/.test(target.pathname)) throw new Error('Solo se admite una base de prueba local explícita.')
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`CREATE TEMP TABLE "PaymentAccount" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "bank" text, "accountNumber" text, "holder" text);
    CREATE TEMP TABLE "AuditLog" ("id" text PRIMARY KEY, "tenantId" text, "action" text, "entity" text, "entityId" text, "metadata" jsonb DEFAULT '{}');
    CREATE TEMP TABLE "Payment" ("id" text, "snapshot" jsonb);`)
  const sql = await readFile(new URL('../prisma/migrations/20270202100000_bank_catalog_labels/migration.sql', import.meta.url), 'utf8')
  const aliases = [...sql.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(([, before, after]) => [before, after])
  const untouched = ['Financiera El Comercio', 'Financiera Finexpar', 'Banco Regional', 'Banco inventado', null]
  for (const tenant of ['tenant-a', 'tenant-b']) {
    for (const [index, bank] of [...aliases.map(([before]) => before), ...untouched].entries()) {
      await client.query('INSERT INTO "PaymentAccount" VALUES ($1,$2,$3,$4,$5)', [`${tenant}-${index}`, tenant, bank, 'numero-sintetico', 'titular-sintetico'])
    }
  }
  await client.query(`INSERT INTO "Payment" VALUES ('p', '{"bank":"Banco Itaú Paraguay","amount":123456}')`)
  const original = (await client.query('SELECT * FROM "PaymentAccount" ORDER BY "id"')).rows
  const payments = (await client.query('SELECT * FROM "Payment"')).rows
  await client.query(sql)
  const first = (await client.query('SELECT * FROM "PaymentAccount" ORDER BY "id"')).rows
  for (let index = 0; index < original.length; index++) {
    const old = original[index], current = first[index]
    assert.deepEqual(current, { ...old, bank: new Map(aliases).get(old.bank) || old.bank })
  }
  const audit = (await client.query('SELECT * FROM "AuditLog" ORDER BY "id"')).rows
  assert.equal(audit.length, aliases.length * 2)
  for (const row of audit) {
    const old = original.find(account => account.id === row.entityId && account.tenantId === row.tenantId)
    assert.equal(row.metadata.before, old.bank)
    assert.equal(row.metadata.after, new Map(aliases).get(old.bank))
  }
  await client.query(sql)
  assert.deepEqual((await client.query('SELECT * FROM "PaymentAccount" ORDER BY "id"')).rows, first)
  assert.deepEqual((await client.query('SELECT * FROM "AuditLog" ORDER BY "id"')).rows, audit)
  assert.deepEqual((await client.query('SELECT * FROM "Payment"')).rows, payments)
  console.log('bank-catalog-migration: PASS · 7 aliases × 2 tenants, legacy/unknown/null unchanged, audit backup, idempotency and payment snapshots unchanged')
} finally { await client.end() }
