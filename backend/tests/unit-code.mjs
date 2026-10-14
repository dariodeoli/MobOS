import assert from 'node:assert/strict'
import pg from 'pg'

// #400 (unidad A) · campos de la ficha y código interno de unidad, por HTTP y
// contra Postgres real: correlativo por empresa (trigger), inserción por SQL
// directo, concurrencia sin duplicados ni huecos, búsqueda por código,
// validaciones (ciclos, garantía, ícono, modo de proveedor, sigla) y permisos.
const [baseUrl, adminToken, sellerToken, gerenteToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !gerenteToken || !databaseUrl) throw new Error('Uso: unit-code.mjs <baseUrl> <admin> <seller> <gerente> <databaseUrl>')

const CLIENT_IP = '198.51.100.62'
async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant, 'x-forwarded-for': CLIENT_IP, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { response, payload: await response.json().catch(() => null) }
}
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const BRANCH = 'branch-a-it'
let checks = 0
const ok = (condition, label) => { assert.ok(condition, label); checks += 1 }
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1 }
const unitByQuery = async q => {
  const result = await request(`/api/inventory-units?branchId=${BRANCH}&q=${encodeURIComponent(q)}`)
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  return result.payload
}

try {
  const tag = `U400${Date.now()}`
  let result = await request('/api/products', { method: 'POST', body: { sku: `${tag}-EQ`, name: `Equipo ${tag}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2000000, stock: 0, branchId: BRANCH } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const producto = result.payload

  // 1) Lote por API: correlativos consecutivos y código con la sigla por defecto (iniciales).
  const serials = [1, 2, 3].map(n => `${tag}-${n}`)
  result = await request('/api/inventory-units', { method: 'POST', body: { productId: producto.id, branchId: BRANCH, serials, batteryCycles: 312, warrantyUntil: '2027-03-15' } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const creadas = result.payload.units
  const seqs = creadas.map(unit => unit.internalSeq)
  ok(seqs.every(Number.isInteger), 'cada unidad nueva recibe internalSeq')
  eq(seqs[1] - seqs[0], 1, 'correlativo consecutivo (1→2)')
  eq(seqs[2] - seqs[1], 1, 'correlativo consecutivo (2→3)')
  eq(creadas[0].batteryCycles, 312, 'ciclos guardados al ingresar')
  eq(creadas[0].warrantyUntil, '2027-03-01T00:00:00.000Z', 'la garantía queda al primer día del mes')

  const [primera] = await unitByQuery(serials[0].replace(/-/g, ''))
  ok(primera, 'GET devuelve la unidad')
  eq(primera.internalCode, `TAI-${String(primera.internalSeq).padStart(4, '0')}`, 'internalCode con iniciales de la empresa (Tenant A Integration → TAI)')
  eq(primera.batteryCycles, 312, 'GET devuelve batteryCycles')
  eq(primera.warrantyUntil, '2027-03-01T00:00:00.000Z', 'GET devuelve warrantyUntil')

  // 2) Búsqueda por código (con/sin guion, minúsculas, ceros): inventory-units y stock/items.
  const code = primera.internalCode
  for (const variante of [code, code.toLowerCase(), code.replace('-', ''), `TAI-${primera.internalSeq}`]) {
    const found = await unitByQuery(variante)
    ok(found.some(unit => unit.id === primera.id), `inventory-units encuentra por «${variante}»`)
  }
  const stock = await request(`/api/stock/items?q=${encodeURIComponent(code)}&limit=50`)
  assert.equal(stock.response.status, 200, JSON.stringify(stock.payload))
  ok(stock.payload.items.some(item => item.id === primera.id), 'stock/items encuentra por código interno')
  ok(!JSON.stringify(stock.payload.items).includes('internalCode'), 'la lista de Stock no expone el código interno')

  // 3) PATCH: ciclos y garantía validados.
  result = await request('/api/inventory-units', { method: 'PATCH', body: { id: primera.id, action: 'details', batteryCycles: 95, warrantyUntil: '2028-01' } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  eq(result.payload.batteryCycles, 95, 'PATCH actualiza ciclos')
  eq(result.payload.warrantyUntil, '2028-01-01T00:00:00.000Z', 'PATCH acepta AAAA-MM')
  for (const mala of [{ batteryCycles: -1 }, { batteryCycles: 'abc' }, { batteryCycles: 99999 }, { batteryCycles: 1.5 }, { warrantyUntil: 'mañana' }, { warrantyUntil: '2028-13' }]) {
    result = await request('/api/inventory-units', { method: 'PATCH', body: { id: primera.id, action: 'details', ...mala } })
    eq(result.response.status, 409, `PATCH rechaza ${JSON.stringify(mala)}`)
  }
  result = await request('/api/inventory-units', { method: 'PATCH', body: { id: primera.id, action: 'details', batteryCycles: null, warrantyUntil: null } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  eq([result.payload.batteryCycles, result.payload.warrantyUntil], [null, null], 'null limpia ciclos y garantía')

  // 4) SQL directo: el trigger también asigna código; concurrencia sin duplicados ni huecos.
  const { rows: [{ max }] } = await db.query(`SELECT MAX("internalSeq") AS max FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it'`)
  const insertRaw = (client, serial, tenant = 'tenant-a-it', productId = producto.id, branchId = BRANCH) => client.query(
    `INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) RETURNING "internalSeq"`, [`raw-${serial}`, tenant, productId, branchId, serial])
  const solo = await insertRaw(db, `${tag}-RAW0`)
  eq(solo.rows[0].internalSeq, max + 1, 'insert SQL directo recibe el siguiente correlativo')
  const N = 25
  const clients = await Promise.all(Array.from({ length: N }, async () => { const client = new pg.Client({ connectionString: databaseUrl }); await client.connect(); return client }))
  const resultados = await Promise.all(clients.map((client, i) => insertRaw(client, `${tag}-C${i}`)))
  await Promise.all(clients.map(client => client.end()))
  const asignados = resultados.map(item => item.rows[0].internalSeq).sort((a, b) => a - b)
  eq(new Set(asignados).size, N, 'concurrencia: sin duplicados')
  eq(asignados, Array.from({ length: N }, (_, i) => max + 2 + i), 'concurrencia: sin huecos')

  // Una transacción que falla devuelve el número (sin hueco).
  await db.query('BEGIN')
  const perdido = await insertRaw(db, `${tag}-ROLL`)
  await db.query('ROLLBACK')
  const siguiente = await insertRaw(db, `${tag}-AFTER`)
  eq(siguiente.rows[0].internalSeq, perdido.rows[0].internalSeq, 'rollback: el número se reutiliza solo si nunca se confirmó')

  // Un correlativo explícito se respeta (importes/restauraciones controladas).
  const explicito = await db.query(`INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","internalSeq","updatedAt") VALUES ($1,'tenant-a-it',$2,$3,$4,987654,now()) RETURNING "internalSeq"`, [`raw-${tag}-EXP`, producto.id, BRANCH, `${tag}-EXP`])
  eq(explicito.rows[0].internalSeq, 987654, 'internalSeq explícito no se pisa')
  await assert.rejects(() => insertRaw(db, `${tag}-DUP`).then(() => db.query(`UPDATE "InventoryUnit" SET "internalSeq" = 987654 WHERE "id" = $1`, [`raw-${tag}-DUP`])), /InventoryUnit_tenantId_internalSeq_key|duplicate/i)
  checks += 1

  // 5) Empresas aisladas: B numera aparte.
  const seqB = async serial => (await insertRaw(db, serial, 'tenant-b-it', 'prod-b-it', 'branch-b-it')).rows[0].internalSeq
  const b1 = await seqB(`${tag}-B1`), b2 = await seqB(`${tag}-B2`)
  eq(b2 - b1, 1, 'tenant B: correlativo propio consecutivo')
  ok(b1 < 987654 && b1 <= 1000, 'tenant B no hereda el correlativo de A')
  const unicos = await db.query(`SELECT count(*)::int AS total, count(DISTINCT "internalSeq")::int AS distintos FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it'`)
  eq(unicos.rows[0].total, unicos.rows[0].distintos, 'único por empresa')

  // 6) Sigla de la empresa: solo ADMIN, 2–4 letras, auditada. Requiere reautenticación reciente.
  result = await request('/api/account', { method: 'POST', body: { password: 'company-password-it' } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  for (const token of [sellerToken, gerenteToken]) {
    result = await request('/api/account', { method: 'PATCH', token, body: { action: 'unitCodePrefix', prefix: 'MOV' } })
    eq(result.response.status, 403, 'solo el dueño cambia la sigla')
  }
  for (const mala of ['M', 'ABCDE', 'M1V', 'M-V', '12']) {
    result = await request('/api/account', { method: 'PATCH', body: { action: 'unitCodePrefix', prefix: mala } })
    eq(result.response.status, 400, `sigla inválida «${mala}»`)
  }
  result = await request('/api/account', { method: 'PATCH', body: { action: 'unitCodePrefix', prefix: 'mov' } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  eq([result.payload.unitCodePrefix, result.payload.effective, result.payload.preview], ['MOV', 'MOV', 'MOV-0001'], 'sigla guardada en mayúsculas')
  const [conMov] = await unitByQuery(serials[0].replace(/-/g, ''))
  eq(conMov.internalCode, `MOV-${String(conMov.internalSeq).padStart(4, '0')}`, 'el código usa la sigla nueva')
  ok((await unitByQuery(`MOV-${conMov.internalSeq}`)).some(unit => unit.id === conMov.id), 'se busca por la sigla nueva')
  const audit = await db.query(`SELECT 1 FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND "action" = 'TENANT_UNIT_CODE_PREFIX_UPDATED'`)
  ok(audit.rowCount >= 1, 'el cambio de sigla queda auditado')
  result = await request('/api/account', { method: 'PATCH', body: { action: 'unitCodePrefix', prefix: '' } })
  eq([result.response.status, result.payload.unitCodePrefix, result.payload.effective], [200, null, 'TAI'], 'vaciar vuelve a las iniciales')

  // 7) Ubicaciones: ícono de un set fijo.
  result = await request('/api/stock-locations', { method: 'POST', body: { branchId: BRANCH, name: `Vitrina ${tag}`, icon: 'VITRINA' } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  eq(result.payload.icon, 'VITRINA', 'ubicación con ícono')
  const ubicacion = result.payload
  result = await request('/api/stock-locations', { method: 'POST', body: { branchId: BRANCH, name: `Mala ${tag}`, icon: 'COHETE' } })
  eq(result.response.status, 400, 'ícono de ubicación fuera del set')
  result = await request('/api/stock-locations', { method: 'PATCH', body: { id: ubicacion.id, icon: 'caja_fuerte' } })
  eq([result.response.status, result.payload.icon], [200, 'CAJA_FUERTE'], 'PATCH cambia el ícono (normaliza mayúsculas)')
  result = await request('/api/stock-locations', { method: 'PATCH', body: { id: ubicacion.id, icon: 'NOPE' } })
  eq(result.response.status, 400, 'PATCH rechaza ícono inválido')
  result = await request('/api/stock-locations', { method: 'PATCH', body: { id: ubicacion.id, icon: null } })
  eq([result.response.status, result.payload.icon], [200, null], 'PATCH quita el ícono')

  // 8) Proveedores: ícono/color/modo, solo administración/gerencia.
  result = await request('/api/suppliers', { method: 'POST', body: { name: `Proveedor ${tag}`, code: `P${tag.slice(-5)}` } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  eq([result.payload.displayMode, result.payload.icon, result.payload.color], ['ABREVIADO', null, null], 'defaults del proveedor')
  const proveedor = result.payload
  result = await request('/api/suppliers', { method: 'PATCH', body: { id: proveedor.id, icon: 'store', color: '#FF0000', displayMode: 'completo' } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  eq([result.payload.icon, result.payload.color, result.payload.displayMode], ['STORE', '#ff0000', 'COMPLETO'], 'PATCH guarda ícono, color y modo normalizados')
  for (const mala of [{ displayMode: 'GRANDE' }, { displayMode: null }, { color: 'rojo' }, { color: '#fff' }, { icon: 'no válido!' }]) {
    result = await request('/api/suppliers', { method: 'PATCH', body: { id: proveedor.id, ...mala } })
    eq(result.response.status, 400, `proveedor rechaza ${JSON.stringify(mala)}`)
  }
  result = await request('/api/suppliers', { method: 'POST', body: { name: `Otro ${tag}`, displayMode: 'XX' } })
  eq(result.response.status, 400, 'alta de proveedor con modo inválido')
  result = await request('/api/suppliers', { method: 'PATCH', token: sellerToken, body: { id: proveedor.id, icon: 'STORE' } })
  eq(result.response.status, 403, 'un vendedor no edita el aspecto del proveedor')
  result = await request('/api/suppliers', { method: 'PATCH', token: gerenteToken, body: { id: proveedor.id, color: '#00ff00' } })
  eq([result.response.status, result.payload.color], [200, '#00ff00'], 'gerencia sí puede')

  console.log(`unit-code: OK (${checks} comprobaciones)`)
} finally {
  // Las unidades por SQL directo no tocan el stock agregado: se retiran para no
  // dejar descuadre en el chequeo de consistencia de stock.
  await db.query(`DELETE FROM "InventoryUnit" WHERE "id" LIKE 'raw-%'`)
  await db.end()
}
