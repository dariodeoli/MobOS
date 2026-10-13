import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(backend, '..')
const pgBin = '/opt/homebrew/bin'
const migration = join(backend, 'prisma/migrations/20270101000000_customer_billing_identity_updated_at_default/migration.sql')
const repair = readFileSync(migration, 'utf8')
// Never inherit database URLs, credentials, or load environment files.
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', TZ: 'UTC', PRISMA_HIDE_UPDATE_MESSAGE: '1' }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: backend, env: cleanEnv, encoding: 'utf8', timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024, ...options,
  })
  assert.equal(result.status, 0, `${command}: ${result.error || result.stderr || result.stdout}`)
  return result.stdout || ''
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(error => error ? reject(error) : resolvePort(port))
    })
  })
}

function prismaCommand(url, args) {
  return run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), ...args], {
    env: { ...cleanEnv, DATABASE_URL: url },
  })
}

function parity(url) {
  return spawnSync(process.execPath, [join(repo, 'scripts/check-db-schema.mjs')], {
    cwd: repo, env: { ...cleanEnv, DATABASE_URL: url }, encoding: 'utf8', timeout: 120_000,
  })
}

async function column(client) {
  const result = await client.query(`SELECT column_default, is_nullable, data_type, datetime_precision
    FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'CustomerBillingIdentity' AND column_name = 'updatedAt'`)
  assert.equal(result.rowCount, 1)
  return result.rows[0]
}

async function snapshot(client) {
  // SQL text preserves every field and exact stored timestamp, not JS Date precision.
  const { rows } = await client.query('SELECT row_to_json(b)::text AS row FROM "CustomerBillingIdentity" b ORDER BY "id"')
  return rows
}

async function repairTwice(client, url) {
  const beforeRows = await snapshot(client)
  const beforeColumn = await column(client)
  for (let pass = 1; pass <= 2; pass++) {
    await client.query(repair)
    assert.deepEqual(await column(client), { ...beforeColumn, column_default: null })
    assert.equal((await column(client)).is_nullable, 'NO')
    assert.deepEqual(await snapshot(client), beforeRows)
    const check = parity(url)
    assert.equal(check.status, 0, check.stderr || check.stdout)
  }
}

async function seed(client) {
  await client.query(`INSERT INTO "Tenant" ("id", "name", "slug", "email", "passwordHash", "updatedAt")
    VALUES ('billing-default-tenant', 'Synthetic Billing Tenant', 'billing-default-tenant',
      'billing-default@example.invalid', 'synthetic-not-a-real-hash', '2020-01-02 03:04:05.123')`)
  await client.query(`INSERT INTO "Customer" ("id", "tenantId", "name", "updatedAt")
    VALUES ('billing-default-customer', 'billing-default-tenant', 'Synthetic Customer', '2020-02-03 04:05:06.456')`)
}

const rawInsert = `INSERT INTO "CustomerBillingIdentity" ("id", "tenantId", "customerId", "name")
  VALUES ($1, 'billing-default-tenant', 'billing-default-customer', $1)`

test('billing identity default repair: isolated fresh and legacy PostgreSQL paths', { timeout: 300_000 }, async t => {
  assert.equal(repair.trim(), 'ALTER TABLE "CustomerBillingIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;')
  for (const binary of ['initdb', 'pg_ctl', 'createdb']) {
    assert.ok(existsSync(join(pgBin, binary)), `Installed PostgreSQL required: ${binary}`)
  }
  const root = mkdtempSync(join(tmpdir(), 'mobos-billing-default-'))
  const data = join(root, 'pgdata')
  const port = await freePort()
  try {
    run(join(pgBin, 'initdb'), ['-D', data, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
    run(join(pgBin, 'pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start'])
    for (const history of ['fresh', 'legacy']) {
      await t.test(history, async () => {
        const database = `billing_${history}`
        run(join(pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database])
        const url = `postgresql://postgres@127.0.0.1:${port}/${database}`
        prismaCommand(url, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'])
        const client = new pg.Client({ connectionString: url, statement_timeout: 15_000, lock_timeout: 5_000 })
        const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
        try {
          await client.connect()
          assert.equal((await column(client)).column_default, null)
          const freshCheck = parity(url)
          assert.equal(freshCheck.status, 0, freshCheck.stderr || freshCheck.stdout)
          await seed(client)
          if (history === 'legacy') {
            // Reproduce the historical conditional ADD COLUMN backfill branch.
            await client.query('ALTER TABLE "CustomerBillingIdentity" DROP COLUMN "updatedAt"')
            await client.query(readFileSync(join(backend, 'prisma/migrations/20261013000000_customer_billing_identity_missing_columns/migration.sql'), 'utf8'))
            assert.match((await column(client)).column_default, /CURRENT_TIMESTAMP/)
            await client.query(rawInsert, ['legacy-omitted'])
            const drift = parity(url)
            assert.equal(drift.status, 1, drift.stderr || drift.stdout)
            assert.match(drift.stderr, /ALTER TABLE "CustomerBillingIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT/)
            t.diagnostic('Legacy conditional backfill default drift reproduced; omitted timestamp accepted before repair.')
          }
          await client.query(`INSERT INTO "CustomerBillingIdentity"
            ("id", "tenantId", "customerId", "name", "uses", "createdAt", "lastUsedAt", "updatedAt")
            VALUES ('explicit-before', 'billing-default-tenant', 'billing-default-customer', 'Synthetic Historical Identity',
              7, '2019-01-01 01:02:03.111', '2020-02-02 02:03:04.222', '2021-03-03 03:04:05.333')`)
          await repairTwice(client, url)
          await assert.rejects(client.query(rawInsert, ['omitted-after']), error => error.code === '23502' && error.column === 'updatedAt')
          await assert.rejects(client.query(`INSERT INTO "CustomerBillingIdentity"
            ("id", "tenantId", "customerId", "name", "updatedAt")
            VALUES ('default-after', 'billing-default-tenant', 'billing-default-customer', 'Default After', DEFAULT)`),
          error => error.code === '23502' && error.column === 'updatedAt')
          const explicit = await client.query(`INSERT INTO "CustomerBillingIdentity"
            ("id", "tenantId", "customerId", "name", "updatedAt")
            VALUES ('explicit-after', 'billing-default-tenant', 'billing-default-customer', 'Explicit After', '2022-04-04 04:05:06.444')
            RETURNING "updatedAt"::text AS timestamp`)
          assert.equal(explicit.rows[0].timestamp, '2022-04-04 04:05:06.444')
          const restoredRows = await snapshot(client)
          await client.query('ALTER TABLE "CustomerBillingIdentity" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP')
          assert.deepEqual(await snapshot(client), restoredRows)
          await client.query(rawInsert, ['rollback-omitted'])
          const rollbackRow = await client.query('SELECT "updatedAt" IS NOT NULL AS stamped FROM "CustomerBillingIdentity" WHERE "id" = $1', ['rollback-omitted'])
          assert.equal(rollbackRow.rows[0].stamped, true)
          await repairTwice(client, url)
          await assert.rejects(client.query(rawInsert, ['omitted-after-rollback']), error => error.code === '23502' && error.column === 'updatedAt')
          const created = await prisma.customerBillingIdentity.create({ data: {
            tenantId: 'billing-default-tenant', customerId: 'billing-default-customer', name: 'Prisma Synthetic Identity',
          } })
          assert.ok(created.updatedAt instanceof Date && Number.isFinite(created.updatedAt.getTime()))
          await client.query('SELECT pg_sleep(0.025)')
          const updated = await prisma.customerBillingIdentity.update({ where: { id: created.id }, data: { uses: { increment: 1 } } })
          assert.equal(updated.uses, created.uses + 1)
          assert.ok(updated.updatedAt.getTime() > created.updatedAt.getTime())
          assert.equal(updated.createdAt.getTime(), created.createdAt.getTime())
          t.diagnostic(`${history}: parity, repeat repair, exact rows/timestamps, NOT NULL, raw writers, inverse/reapply, Prisma create/update passed.`)
        } finally {
          await prisma.$disconnect()
          await client.end()
        }
      })
    }
  } finally {
    // pg_ctl reads only this unique cluster's PID; never kill by port or process name.
    if (existsSync(join(data, 'postmaster.pid'))) {
      run(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'])
    }
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false)
    t.diagnostic(`Owned PostgreSQL cluster stopped and removed: ${root}`)
  }
})
