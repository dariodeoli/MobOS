import assert from 'node:assert/strict'
import pg from 'pg'

// Verificación de stock («¿está físicamente?»): cualquier usuario autenticado verifica;
// el check deja quién y cuándo; el deshacer vale 1 minuto y solo para quien lo hizo;
// la sesión (escanear, pendientes, inesperadas, terminar) respeta empresa y sucursal.
// Uso: stock-verification-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <adminOtraEmpresa> <databaseUrl>
const [base, admin, seller, cajera, gerente, adminC, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !seller || !cajera || !gerente || !adminC || !databaseUrl) throw new Error('Uso: stock-verification-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <adminOtraEmpresa> <databaseUrl>')

const BRANCH = 'branch-a-it'
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0] ?? null

try {
  const tag = `VF${Date.now().toString(36).toUpperCase()}`
  const producto = await req('/api/products', 'POST', { sku: `${tag}-EQ`, name: `Equipo ${tag}`, category: 'Celulares', model: 'VF', capacity: '128GB', color: 'Negro', pricePyg: 3000000, costPyg: 2000000, stock: 0, branchId: BRANCH }, 201)
  const series = [`${tag}A1`, `${tag}A2`, `${tag}A3`]
  await req('/api/inventory-units', 'POST', { productId: producto.id, branchId: BRANCH, serials: series, costPyg: 2100000 }, 201)

  // ── Check por fila: cualquier usuario lo hace y queda quién + cuándo.
  const r1 = await req('/api/inventory-units/verify', 'POST', { serial: series[0] }, 200, seller)
  assert.equal(r1.verified, 1)
  const u1 = await one('SELECT "lastVerifiedAt", "lastVerifiedById", "verificationCount" FROM "InventoryUnit" WHERE "serial" = $1', [series[0]])
  assert.ok(u1.lastVerifiedAt && u1.lastVerifiedById, 'registra usuario y hora')
  const vendedorId = u1.lastVerifiedById
  assert.equal(u1.verificationCount, 1)

  // ── Deshacer: otro usuario no puede; quien lo hizo, sí, y restaura lo anterior.
  await req('/api/inventory-units/verify', 'DELETE', { serial: series[0] }, 409, admin)
  const undo = await req('/api/inventory-units/verify', 'DELETE', { serial: series[0] }, 200, seller)
  assert.equal(undo.undone, true)
  const u1b = await one('SELECT "lastVerifiedAt", "lastVerifiedById", "verificationCount" FROM "InventoryUnit" WHERE "serial" = $1', [series[0]])
  assert.equal(u1b.lastVerifiedAt, null)
  assert.equal(u1b.lastVerifiedById, null)
  assert.equal(u1b.verificationCount, 0)
  await req('/api/inventory-units/verify', 'DELETE', { serial: series[0] }, 409, seller)
  // Pasado el minuto no se puede deshacer.
  await req('/api/inventory-units/verify', 'POST', { serial: series[1] }, 200, seller)
  await db.query('UPDATE "InventoryUnit" SET "lastVerifiedAt" = now() - interval \'2 minutes\' WHERE "serial" = $1', [series[1]])
  await req('/api/inventory-units/verify', 'DELETE', { serial: series[1] }, 409, seller)

  // ── Sesión de verificación por escaneo.
  const inicio = await req('/api/stock-verifications', 'POST', { branchId: BRANCH }, 201, gerente)
  assert.ok(inicio.id)
  const reuso = await req('/api/stock-verifications', 'POST', { branchId: BRANCH }, 200, gerente)
  assert.equal(reuso.reused, true)
  assert.equal(reuso.id, inicio.id)
  const id = inicio.id
  const antes = await req(`/api/stock-verifications/${id}`, 'GET', undefined, 200, gerente)
  assert.ok(antes.summary.expected >= 3)
  assert.ok(antes.pending.some(fila => fila.serial === series[2]))

  const escaneo = await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: series[2].toLowerCase() }, 200, seller)
  assert.equal(escaneo.outcome, 'VERIFIED')
  const dup = await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: series[2] }, 200, seller)
  assert.equal(dup.duplicate, true)
  const u3 = await one('SELECT "lastVerifiedById", "verificationCount" FROM "InventoryUnit" WHERE "serial" = $1', [series[2]])
  assert.equal(u3.lastVerifiedById, vendedorId, 'el escaneo firma con quien escaneó')
  assert.equal(u3.verificationCount, 1, 'un duplicado no vuelve a verificar')
  const desconocido = await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: `${tag}NOEXISTE` }, 200, seller)
  assert.equal(desconocido.outcome, 'UNEXPECTED')
  assert.equal(desconocido.reason, 'UNKNOWN')

  // Una unidad vendida y otra de otra sucursal quedan como inesperadas con su motivo.
  await db.query('UPDATE "InventoryUnit" SET "status" = \'SOLD\' WHERE "serial" = $1', [series[1]])
  const vendida = await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: series[1] }, 200, gerente)
  assert.equal(vendida.reason, 'SOLD')
  await db.query('UPDATE "InventoryUnit" SET "status" = \'AVAILABLE\' WHERE "serial" = $1', [series[1]])

  const medio = await req(`/api/stock-verifications/${id}`, 'GET', undefined, 200, cajera)
  assert.equal(medio.summary.verified, 1)
  assert.equal(medio.summary.unexpected, 2)
  assert.equal(medio.verified[0].scannedBy.name.length > 0, true)
  assert.ok(medio.pending.some(fila => fila.serial === series[0]), 'lo no escaneado queda pendiente')

  // ── Aislamiento por empresa: otra empresa no ve ni toca la sesión.
  await req(`/api/stock-verifications/${id}`, 'GET', undefined, 404, adminC)
  await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: series[0] }, 404, adminC)
  const listaC = await req('/api/stock-verifications', 'GET', undefined, 200, adminC)
  assert.ok(!listaC.some(item => item.id === id))
  const escaneadaPorC = await one('SELECT count(*)::int AS n FROM "StockVerificationScan" WHERE "verificationId" = $1 AND "serial" = $2', [id, series[0]])
  assert.equal(escaneadaPorC.n, 0)

  // ── Terminar: resumen persistido, historial y la sesión ya no admite escaneos.
  const fin = await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'finish' }, 200, gerente)
  assert.equal(fin.status, 'FINISHED')
  assert.equal(fin.summary.verified, 1)
  assert.equal(fin.summary.unexpected, 2)
  assert.equal(fin.summary.missing, fin.summary.expected - 1)
  await req(`/api/stock-verifications/${id}`, 'PATCH', { action: 'scan', serial: series[0] }, 409, gerente)
  const guardada = await one('SELECT "status", "finishedById", "missingCount", jsonb_array_length("missingSerials") AS n FROM "StockVerification" WHERE "id" = $1', [id])
  assert.equal(guardada.status, 'FINISHED')
  assert.ok(guardada.finishedById)
  assert.equal(guardada.n, guardada.missingCount)
  const historial = await req('/api/stock-verifications', 'GET', undefined, 200, gerente)
  const fila = historial.find(item => item.id === id)
  assert.equal(fila.status, 'FINISHED')
  assert.equal(fila.summary.unexpected, 2)
  const cerrada = await req(`/api/stock-verifications/${id}`, 'GET', undefined, 200, gerente)
  assert.ok(cerrada.pending.length === cerrada.summary.missing)

  // ── Sucursal: quien tiene la suya asignada no puede iniciar una sesión en otra.
  const propia = await req('/api/stock-verifications', 'POST', { branchId: 'otra-sucursal-inexistente' }, 201, seller)
  const detallePropia = await req(`/api/stock-verifications/${propia.id}`, 'GET', undefined, 200, seller)
  assert.notEqual(detallePropia.branch?.id, 'otra-sucursal-inexistente')
  await req(`/api/stock-verifications/${propia.id}`, 'PATCH', { action: 'cancel' }, 200, seller)

  console.log(`stock-verification-http: ${checks} checks OK`)
} finally {
  await db.end()
}
