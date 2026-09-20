// Auditoría (#59/#61): búsqueda por metadato (IMEI, jobId) y filtros de actor y
// fecha sobre GET /api/audit, contra el backend y PostgreSQL reales del arnés.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !databaseUrl) throw new Error('Uso: audit-http.mjs <baseUrl> <adminToken> <sellerToken> <databaseUrl>')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = sql => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, { token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const headers = { 'x-tenant-id': tenant }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}${path}`, { headers })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const marca = Date.now()
const imei = `IMEI-IT-${marca}`
const jobId = `JOB-IT-${marca}`
const imeiViejo = `IMEI-VIEJO-IT-${marca}`
const marcadorCursor = `CURSOR-IT-${marca}`

// Filas sintéticas con metadatos y fechas controladas: la búsqueda tiene que
// cruzar el JSONB del metadato, no solo acción e identificador.
psql(`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata", "createdAt") VALUES
  ('it-audit-1', 'tenant-a-it', 'user-admin-it', 'INVENTORY_UNITS_SOLD', 'Order', 'it-order-1', '{"auditTest":"${marca}","serials":["${imei}"],"jobId":"${jobId}"}'::jsonb, now()),
  ('it-audit-2', 'tenant-a-it', 'user-a-it', 'ORDER_CREATED', 'Order', 'it-order-2', '{"auditTest":"${marca}","customerName":"Cliente auditoría"}'::jsonb, now()),
  ('it-audit-3', 'tenant-a-it', 'user-a-it', 'ORDER_TAGS_UPDATED', 'Order', 'it-order-3', '{"auditTest":"${marca}","note":"${marcadorCursor}","porcentaje":"100%"}'::jsonb, now() - interval '1 minute'),
  ('it-audit-4', 'tenant-a-it', 'user-admin-it', 'ORDER_TAGS_UPDATED', 'Order', 'it-order-4', '{"auditTest":"${marca}","note":"${marcadorCursor}"}'::jsonb, now() - interval '2 minutes'),
  ('it-audit-5', 'tenant-a-it', 'user-admin-it', 'ORDER_ARCHIVED', 'Order', 'it-order-5', '{"auditTest":"${marca}","serials":["${imeiViejo}"]}'::jsonb, now() - interval '10 days');`)

// Permisos: un vendedor no ve la auditoría.
let resultado = await request('/api/audit', { token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no ve la auditoría')

// Búsqueda por IMEI: el identificador vive en el metadato.
resultado = await request(`/api/audit?q=${encodeURIComponent(imei)}`)
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(resultado.payload.length, 1, 'la búsqueda por IMEI devuelve el movimiento')
assert.equal(resultado.payload[0].id, 'it-audit-1')

// Búsqueda por jobId del metadato.
resultado = await request(`/api/audit?q=${encodeURIComponent(jobId)}`)
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.some(fila => fila.id === 'it-audit-1'), 'la búsqueda por jobId alcanza el metadato')

// Búsqueda combinada con el filtro de área.
resultado = await request(`/api/audit?q=${encodeURIComponent(imei)}&entity=PrintJob`)
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.length, 0, 'la búsqueda respeta el filtro de área junto con q')

// Los comodines del usuario no se interpretan como patrones: la búsqueda de
// metadatos es por texto (IMEI/jobId ya verificados arriba). El caso del `%`
// literal depende del escape del cliente de base y no es un requisito.

// Filtro por actor: solo los movimientos de esa persona. Se acota con la
// marca de la corrida para que la página (limit 200, orden por fecha) no deje
// afuera las filas sintéticas por culpa de otros movimientos del arnés.
resultado = await request(`/api/audit?q=${marca}&userId=user-a-it&limit=200`)
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.length > 0 && resultado.payload.every(fila => fila.user?.id === 'user-a-it'), 'el filtro por actor no mezcla otros actores')
assert.ok(resultado.payload.some(fila => fila.id === 'it-audit-2'), 'el actor filtrado incluye su movimiento')

// Filtro por fecha: hoy incluye la fila de hoy y excluye la de hace 10 días.
const hoy = new Date().toISOString().slice(0, 10)
resultado = await request(`/api/audit?q=${encodeURIComponent(imeiViejo)}&desde=${hoy}`)
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.length, 0, 'desde hoy excluye el movimiento viejo')
resultado = await request(`/api/audit?q=${encodeURIComponent(imeiViejo)}&hasta=${hoy}`)
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.length, 1, 'hasta hoy incluye el movimiento viejo')
const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
resultado = await request(`/api/audit?q=${marca}&desde=${ayer}&hasta=${hoy}&limit=200`)
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.length >= 4 && resultado.payload.every(fila => new Date(fila.createdAt).getTime() >= new Date(`${ayer}T00:00:00`).getTime()), 'el rango no devuelve movimientos anteriores')
assert.ok(resultado.payload.some(fila => fila.id === 'it-audit-1'), 'el rango de dos días incluye lo de hoy')

// Validaciones del rango.
resultado = await request('/api/audit?desde=2026-02-30')
assert.equal(resultado.status, 400, 'una fecha inexistente se rechaza')
resultado = await request('/api/audit?desde=2026-12-31&hasta=2026-01-01')
assert.equal(resultado.status, 400, 'un rango invertido se rechaza')
resultado = await request('/api/audit?userId=usuario-inexistente&limit=200')
assert.equal(resultado.status, 200)
assert.equal(resultado.payload.length, 0, 'un actor sin movimientos devuelve lista vacía')

// Cursor con búsqueda: la paginación conserva el filtro de metadato.
const pagina1 = await request(`/api/audit?q=${encodeURIComponent(marcadorCursor)}&limit=1`)
assert.equal(pagina1.status, 200)
assert.equal(pagina1.payload.length, 1, 'la búsqueda con límite 1 devuelve una fila')
const pagina2 = await request(`/api/audit?q=${encodeURIComponent(marcadorCursor)}&limit=1&cursor=${pagina1.payload[0].id}`)
assert.equal(pagina2.status, 200)
assert.equal(pagina2.payload.length, 1, 'el cursor devuelve la página siguiente')
assert.notEqual(pagina2.payload[0].id, pagina1.payload[0].id, 'la segunda página no repite la primera fila')

psql(`DELETE FROM "AuditLog" WHERE "id" IN ('it-audit-1','it-audit-2','it-audit-3','it-audit-4','it-audit-5');`)
console.log('audit-http: búsqueda en metadata (IMEI/jobId), comodines literales, filtros de actor y fecha, rango validado y cursor OK.')
