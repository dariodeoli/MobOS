// #658: history-only GETs against the disposable integration cluster. No provider checks.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Pool } = require('pg')
const [base, token, connectionString] = process.argv.slice(2)
if (!base || !token || !connectionString) throw new Error('Synthetic base/token/database arguments required')
const database = new URL(connectionString)
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/mobos_it', 'Only the disposable integration database is allowed')
const fixtureIds = ['imei658-tenant-a-history', 'imei658-tenant-b-history']
const db = new Pool({ connectionString })
let checks = 0
const ok = (value, label) => { assert.ok(value, label); checks++ }
const get = query => fetch(`${base}/api/imei${query}`, { headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it' } })
try {
  for (const [index, tenantId] of ['tenant-a-it', 'tenant-b-it'].entries()) await db.query('INSERT INTO "ImeiCheckQuery" (id, "tenantId", imei, "imeiMasked", "serviceKey", "serviceName", status) VALUES ($1,$2,$3,$4,$5,$6,$7)', [fixtureIds[index], tenantId, '111111111111119', 'fixture-masked', 'APPLE_BASIC', 'Synthetic history', 'fallido'])
  const before = await db.query('SELECT count(*)::int AS count FROM "ImeiCheckQuery"')
  for (const value of ['', '   ', '123', '111111111111111']) {
    const response = await get(`?imei=${encodeURIComponent(value)}`)
    const body = await response.json()
    ok(response.status === 400 && typeof body.message === 'string' && !Object.hasOwn(body, 'consultas'), 'invalid explicit filter returns controlled400 without unrelated history')
  }
  const response = await get('?imei=111%20111%20111%20111%20119&tenantId=tenant-b-it')
  const filtered = await response.json()
  ok(response.status === 200 && filtered.consultas.length === 1 && filtered.consultas[0].id === fixtureIds[0], 'normalized synthetic filter stays scoped to current tenant')
  const listing = await get('')
  ok(listing.status === 200 && Array.isArray((await listing.json()).consultas), 'absent filter preserves authorized general history')
  ok((await db.query('SELECT count(*)::int AS count FROM "ImeiCheckQuery"')).rows[0].count === before.rows[0].count, 'history filtering creates no provider query or credit reservation')
  console.log(`PASS: IMEI history explicit validation, normalized filter and absent listing — ${checks} checks; synthetic GET only`)
} finally { await db.query('DELETE FROM "ImeiCheckQuery" WHERE id = ANY($1::text[])', [fixtureIds]); await db.end() }
