// Consulta de IMEI (#193): requestId por empresa y sin doble consulta al proveedor.
// Uso: node backend/tests/imei-request-id.mjs BASE_URL ADMIN_TOKEN DATABASE_URL PG_BIN

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl || !pgBin) throw new Error('Uso: imei-request-id.mjs <baseUrl> <adminToken> <databaseUrl> <pgBin>')
const psql = sql => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-tAc', sql], { encoding: 'utf8' }).trim()
const post = body => fetch(`${baseUrl}/api/imei`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async response => ({ response, payload: await response.json().catch(() => null) }))

const marca = Date.now()
const imei = '490154203237518'
const consulta = requestId => ({ action: 'checks', imei, confirm: true, requestId })

// 10 POST paralelos con el mismo requestId: una sola consulta (un 201) y una sola fila.
const paralelo = `it-par-${marca}`
const resultados = await Promise.all(Array.from({ length: 10 }, () => post(consulta(paralelo))))
const estados = resultados.map(r => r.response.status).sort()
assert.deepEqual(estados, [200, 200, 200, 200, 200, 200, 200, 200, 200, 201], JSON.stringify(estados))
assert.equal(psql(`SELECT count(*) FROM "ImeiCheckQuery" WHERE "requestId" = '${paralelo}'`), '1')
const ids = new Set(resultados.map(r => r.payload.id))
assert.equal(ids.size, 1, 'todas las respuestas apuntan a la misma consulta')
assert.equal(psql(`SELECT status FROM "ImeiCheckQuery" WHERE "requestId" = '${paralelo}'`), 'verificado')

// requestId ya usado por OTRA empresa: 409 limpio y nada de esa empresa en la respuesta.
const ajeno = `it-ajeno-${marca}`
psql(`INSERT INTO "ImeiCheckQuery" ("id","tenantId","imei","imeiMasked","serviceKey","serviceName","status","requestId","normalized") VALUES ('it-imei-b-${marca}','tenant-b-it','356938035643809','xxxxxxxxxxx3809','APPLE_BASIC','Apple Basic','verificado','${ajeno}','[]')`)
const cruzado = await post(consulta(ajeno))
assert.equal(cruzado.response.status, 409, JSON.stringify(cruzado.payload))
assert.match(cruzado.payload.message, /requestId en uso/)
assert.ok(!JSON.stringify(cruzado.payload).includes('3809'), 'no se filtran datos de otra empresa')
assert.equal(psql(`SELECT count(*) FROM "ImeiCheckQuery" WHERE "requestId" = '${ajeno}' AND "tenantId" = 'tenant-a-it'`), '0')

// El mismo requestId de la propia empresa sigue siendo idempotente.
const repetido = await post(consulta(paralelo))
assert.equal(repetido.response.status, 200)
assert.equal(repetido.payload.id, [...ids][0])

console.log('imei-request-id: checks OK (10 paralelos = 1 consulta, 409 entre empresas sin fuga, repetición idempotente).')
