import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

// Retención de IMEI en el carrito del POS (CART_HOLD): carrera, venta de otro vendedor, vencimiento con el reloj
// de Postgres, venta offline contra una unidad retenida, permisos de liberar, tope de 10 (422), limpieza y
// migración re-ejecutable. Por HTTP contra una base real.
//
// Uso: node cart-holds.mjs <baseUrl> <admin> <sellerA> <sellerA2> <gerente> <sellerB> <databaseUrl> <maintenanceToken>
const [baseUrl, adminToken, sellerA, sellerA2, gerenteToken, sellerB, databaseUrl, maintenanceToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerA || !sellerA2 || !gerenteToken || !sellerB || !databaseUrl) throw new Error('Uso: cart-holds.mjs <baseUrl> <admin> <sellerA> <sellerA2> <gerente> <sellerB> <databaseUrl> [maintenanceToken]')

const CLIENT_IP = '198.51.100.88'
const BRANCH = 'branch-a-it'
let checks = 0
let secuencia = 0
async function request(route, { method = 'GET', body, token = adminToken, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': CLIENT_IP, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, payload: await response.json().catch(() => null) }
}
const ok = (condition, label) => { assert.ok(condition, label); checks += 1 }
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1 }
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const unidad = async serial => (await q('SELECT id, status::text AS status, "reservationKind"::text AS kind, "reservedById", "holdCartId", "holdStartedAt", "reservedUntil", "reservationCustomer" FROM "InventoryUnit" WHERE "tenantId" = $1 AND serial = $2', ['tenant-a-it', serial]))[0]
const auditoria = async (action, serial) => Number((await q('SELECT COUNT(*)::int AS n FROM "AuditLog" l JOIN "InventoryUnit" u ON u.id = l."entityId" WHERE l.action = $1 AND u.serial = $2', [action, serial]))[0].n)
const venceYa = serial => q(`UPDATE "InventoryUnit" SET "reservedUntil" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE "tenantId" = 'tenant-a-it' AND serial = $1`, [serial])
const tag = `CH${Date.now().toString(36).toUpperCase()}`
const cart = etiqueta => `cart-${tag}-${etiqueta}`.toLowerCase()
const hold = (token, cartId, serials, extra = {}) => request('/api/inventory-reservations/holds', { method: 'POST', token, body: { cartId, deviceId: `device-${tag}`.toLowerCase(), serials, ...extra } })
const holdsPatch = (token, body) => request('/api/inventory-reservations/holds', { method: 'PATCH', token, body })
async function vender(token, productId, serials, extra = {}) {
  secuencia += 1
  return request('/api/orders', { method: 'POST', token, headers: { 'Idempotency-Key': `ch-${tag}-${secuencia}`.padEnd(16, '0').toLowerCase() }, body: { items: [{ productId, description: 'Equipo retenido', quantity: serials.length, unitPricePyg: 1000000, serials }], ...extra } })
}

try {
  // ── 0. Migración re-ejecutable ──────────────────────────────────────────────────────────────────────────────
  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')
  const sql = readFileSync(path.join(migrationsDir, '20270212000000_cart_holds', 'migration.sql'), 'utf8')
  await db.query(sql); await db.query(sql)
  checks += 1 // dos corridas sin error
  eq((await q(`SELECT unnest(enum_range(NULL::"InventoryReservationKind"))::text AS v ORDER BY 1`)).map(row => row.v), ['CART_HOLD', 'CUSTOMER'], 'enum de tipos de reserva')
  eq((await q(`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name = 'InventoryUnit' AND column_name IN ('reservationKind','holdCartId','holdDeviceId','holdStartedAt')`))[0].n, 4, 'columnas nuevas')

  // ── Datos: un producto serializado con 16 unidades en la sucursal A y una en la sucursal A2 ───────────────────
  let result = await request('/api/products', { method: 'POST', body: { sku: `${tag}-EQ`, name: `Equipo retenido ${tag}`, category: 'Celulares', model: 'CH', capacity: '128GB', color: 'Negro', pricePyg: 1000000, costPyg: 700000, stock: 1, branchId: BRANCH, imei: `${tag}-0` } })
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  const producto = result.payload
  const serials = Array.from({ length: 16 }, (_, i) => `${tag}${String(i + 1).padStart(2, '0')}`)
  result = await request('/api/inventory-units', { method: 'POST', body: { productId: producto.id, branchId: BRANCH, serials } })
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  const [s1, s2, s3, s4, s5, s6, s7, s8, s9] = serials
  const A = 'user-a-it'; const A2 = 'user-a-2-it'

  // ── 1. Elegir un IMEI sin cliente lo retiene 5 min; idempotente ──────────────────────────────────────────────
  result = await hold(sellerA, cart('a'), [s1])
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  ok(result.payload.serverNow, 'la respuesta trae serverNow')
  ok(result.payload.held[0].secondsLeft >= 295 && result.payload.held[0].secondsLeft <= 300, `quedan ~300 s (${result.payload.held[0].secondsLeft})`)
  let fila = await unidad(s1)
  eq([fila.status, fila.kind, fila.reservedById, fila.holdCartId, fila.reservationCustomer], ['RESERVED', 'CART_HOLD', A, cart('a'), null], 'queda retenida por el vendedor, sin cliente')
  const inicio = fila.holdStartedAt.getTime()
  result = await hold(sellerA, cart('a'), [s1])
  assert.equal(result.status, 201)
  eq((await unidad(s1)).holdStartedAt.getTime(), inicio, 'renovar no reinicia el arranque')
  eq(await auditoria('INVENTORY_CART_HOLD_CREATED', s1), 1, 'un solo evento de creación')

  // ── 2. Otro vendedor: 409 «Retenida por X · m:ss», no puede retener ni vender ────────────────────────────────
  result = await hold(sellerA2, cart('b'), [s1])
  eq(result.status, 409, 'otro vendedor no la retiene')
  ok(/^Retenida por Seller A · \d+:\d{2}$/.test(result.payload.message), result.payload.message)
  eq(result.payload.conflicts[0].holderName, 'Seller A', 'detalle del titular')
  result = await vender(sellerA2, producto.id, [s1])
  eq(result.status, 409, 'otro vendedor no la vende')
  ok(/Retenida por Seller A · \d+:\d{2}/.test(result.payload.message), result.payload.message)
  eq((await unidad(s1)).status, 'RESERVED', 'sigue retenida')

  // ── 3. Carrera: dos POST simultáneos por el mismo serial → un 201 y un 409 ───────────────────────────────────
  const carrera = await Promise.all([hold(sellerA, cart('r1'), [s2]), hold(sellerA2, cart('r2'), [s2])])
  eq(carrera.map(r => r.status).sort(), [201, 409], 'exactamente un 201 y un 409')
  const ganador = carrera.findIndex(r => r.status === 201) === 0 ? A : A2
  eq((await unidad(s2)).reservedById, ganador, 'la fila queda con el ganador')
  const carrera2 = await Promise.all(Array.from({ length: 6 }, (_, i) => hold(i % 2 ? sellerA : sellerA2, cart(`rr${i}`), [s3])))
  eq(carrera2.filter(r => r.status === 201).length, 1, 'seis intentos simultáneos: uno solo gana')

  // ── 4. Vencimiento con el reloj de Postgres ──────────────────────────────────────────────────────────────────
  await venceYa(s1)
  result = await hold(sellerA2, cart('b'), [s1])
  assert.equal(result.status, 201, 'una retención vencida la toma otro sin esperar a ningún barrido')
  eq((await unidad(s1)).reservedById, A2, 'ahora es de A2')
  await venceYa(s3)
  result = await request(`/api/inventory-units?productId=${producto.id}&branchId=${BRANCH}`, { token: sellerA })
  assert.equal(result.status, 200)
  const filaS3 = result.payload.find(unit => unit.serial === s3)
  eq([filaS3.status, filaS3.reservationKind], ['AVAILABLE', null], 'leer la lista suelta la retención vencida')
  const filaS1 = result.payload.find(unit => unit.serial === s1)
  eq([filaS1.status, filaS1.reservationKind, filaS1.reservedBy.name], ['RESERVED', 'CART_HOLD', 'Seller A Two'], 'la lista informa quién la retiene')
  ok(filaS1.serverNow && filaS1.reservedUntil, 'serverNow y reservedUntil en la lista')
  eq(await auditoria('INVENTORY_RESERVATION_EXPIRED', s3), 0, 'la retención de carrito no deja evento de reserva vencida de cliente')

  // ── 5. Venta: convierte la retención propia; la vencida que nadie tomó también ───────────────────────────────
  assert.equal((await hold(sellerA, cart('v'), [s4, s5])).status, 201)
  result = await vender(sellerA, producto.id, [s4])
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  fila = await unidad(s4)
  eq([fila.status, fila.kind, fila.reservedById, fila.holdCartId, fila.holdStartedAt], ['SOLD', null, null, null, null], 'vendida: columnas limpias')
  eq(await auditoria('INVENTORY_CART_HOLD_CONVERTED', s4), 1, 'conversión auditada')
  await venceYa(s5)
  result = await vender(sellerA, producto.id, [s5])
  assert.equal(result.status, 201, `vencida y sin tomar: la venta procede (${JSON.stringify(result.payload)})`)
  eq((await unidad(s5)).status, 'SOLD', 'vendida')

  // ── 6. Venta offline que sincroniza contra una unidad retenida por otro: 409 ────────────────────────────────
  assert.equal((await hold(sellerA, cart('o'), [s6])).status, 201)
  result = await vender(sellerA2, producto.id, [s6], { offline: true })
  eq(result.status, 409, 'offline vs retenida por otro')
  eq((await unidad(s6)).reservedById, A, 'la retención del otro no se tocó')

  // ── 7. Permisos de liberar ───────────────────────────────────────────────────────────────────────────────────
  assert.equal((await hold(sellerA, cart('p'), [s7])).status, 201)
  result = await holdsPatch(sellerA2, { action: 'release', serials: [s7] })
  eq(result.status, 403, 'un vendedor no libera la de otro')
  eq((await unidad(s7)).status, 'RESERVED', 'sigue retenida')
  result = await holdsPatch(gerenteToken, { action: 'release', serials: [s7] })
  assert.equal(result.status, 200, JSON.stringify(result.payload))
  eq([result.payload.released, result.payload.others], [1, 1], 'gerencia libera la ajena')
  eq(await auditoria('CART_HOLD_RELEASED_BY_MANAGER', s7), 1, 'auditoría de la liberación de gerencia')
  eq((await unidad(s7)).status, 'AVAILABLE', 'quedó disponible')
  result = await holdsPatch(sellerA, { action: 'release', serials: [s7] })
  eq([result.status, result.payload.released], [200, 0], 'liberar algo ya libre es idempotente')
  assert.equal((await hold(sellerA, cart('q'), [s8, s9])).status, 201)
  result = await holdsPatch(sellerA, { action: 'release', cartId: cart('q') })
  eq([result.status, result.payload.released], [200, 2], 'liberar por carrito')
  // sendBeacon: POST con action release y text/plain
  assert.equal((await hold(sellerA, cart('beacon'), [s8])).status, 201)
  const beacon = await fetch(`${baseUrl}/api/inventory-reservations/holds`, { method: 'POST', headers: { Authorization: `Bearer ${sellerA}`, 'Content-Type': 'text/plain', 'x-forwarded-for': CLIENT_IP }, body: JSON.stringify({ action: 'release', cartId: cart('beacon') }) })
  eq(beacon.status, 200, 'POST release (sendBeacon)')
  eq((await unidad(s8)).status, 'AVAILABLE', 'liberada por beacon')

  // ── 8. Latido y tope absoluto de 60 min ──────────────────────────────────────────────────────────────────────
  assert.equal((await hold(sellerA, cart('h'), [s8])).status, 201)
  await q(`UPDATE "InventoryUnit" SET "reservedUntil" = (now() AT TIME ZONE 'UTC') + interval '10 seconds' WHERE "tenantId" = 'tenant-a-it' AND serial = $1`, [s8])
  result = await holdsPatch(sellerA, { action: 'renew', cartId: cart('h'), serials: [s8, s9] })
  assert.equal(result.status, 200, JSON.stringify(result.payload))
  ok(result.payload.held[0].secondsLeft > 290, 'el latido extiende a 5 min')
  eq(result.payload.lost, [s9], 'lo que no se renovó se informa')
  await q(`UPDATE "InventoryUnit" SET "holdStartedAt" = (now() AT TIME ZONE 'UTC') - interval '59 minutes 55 seconds', "reservedUntil" = (now() AT TIME ZONE 'UTC') + interval '3 seconds' WHERE "tenantId" = 'tenant-a-it' AND serial = $1`, [s8])
  result = await holdsPatch(sellerA, { action: 'renew', cartId: cart('h') })
  ok(result.payload.held[0].capped === true && result.payload.held[0].secondsLeft <= 6, `el latido respeta el tope de 60 min (${result.payload.held[0].secondsLeft} s)`)
  result = await holdsPatch(sellerA2, { action: 'renew', cartId: cart('h') })
  eq(result.payload.held.length, 0, 'otro vendedor no renueva carritos ajenos')
  await holdsPatch(sellerA, { action: 'release', cartId: cart('h') })

  // ── 9. Tope de 10 retenciones por vendedor: 422 ──────────────────────────────────────────────────────────────
  await holdsPatch(sellerA, { action: 'release', serials }) // limpia lo que quedara de A
  result = await hold(sellerA, cart('t'), serials.slice(0, 10).filter(serial => !['SOLD'].includes((serial))))
  // s4 y s5 se vendieron: se usan otras diez libres
  const libres = (await q(`SELECT serial FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it' AND "productId" = $1 AND status = 'AVAILABLE' ORDER BY serial`, [producto.id])).map(row => row.serial)
  await holdsPatch(sellerA, { action: 'release', cartId: cart('t') })
  ok(libres.length >= 11, `hay unidades libres suficientes (${libres.length})`)
  result = await hold(sellerA, cart('t'), libres.slice(0, 10))
  eq(result.status, 201, 'diez retenciones entran')
  result = await hold(sellerA, cart('t'), [libres[10]])
  eq(result.status, 422, 'la undécima da 422')
  result = await hold(sellerA, cart('t'), libres.slice(0, 10))
  eq(result.status, 201, 'renovar las diez sigue siendo válido')
  result = await hold(sellerA2, cart('t2'), [libres[10]])
  eq(result.status, 201, 'el tope es por vendedor')
  await holdsPatch(sellerA, { action: 'release', cartId: cart('t') })
  await holdsPatch(sellerA2, { action: 'release', cartId: cart('t2') })

  // ── 10. Alcance: otra empresa, otra sucursal ─────────────────────────────────────────────────────────────────
  result = await hold(sellerB, cart('x'), [libres[0]])
  eq(result.status, 409, 'otra empresa no ve la unidad')
  result = await request('/api/inventory-units', { method: 'POST', body: { productId: 'prod-a-crossbranch-it', branchId: 'branch-a2-it', serials: [`${tag}-X`] } })
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  result = await hold(sellerA, cart('y'), [`${tag}-X`])
  eq(result.status, 409, 'una unidad de otra sucursal no se retiene')

  // ── 11. No aparecen como reservas de cliente; la tarea diaria las suelta sin aviso ───────────────────────────
  assert.equal((await hold(sellerA, cart('l'), [libres[0]])).status, 201)
  result = await request('/api/inventory-reservations')
  assert.equal(result.status, 200)
  ok(!result.payload.some(unit => unit.serial === libres[0]), 'GET inventory-reservations no lista retenciones de carrito')
  await venceYa(libres[0])
  if (maintenanceToken) {
    const tarea = await fetch(`${baseUrl}/api/internal/release-expired-reservations`, { method: 'POST', headers: { Authorization: `Bearer ${maintenanceToken}`, 'x-forwarded-for': CLIENT_IP } })
    eq(tarea.status, 200, 'tarea diaria')
    eq((await unidad(libres[0])).status, 'AVAILABLE', 'la tarea suelta la retención vencida')
    eq(await auditoria('RESERVATION_DUE_REMINDED', libres[0]), 0, 'sin aviso al cliente')
  }
  // Una reserva de cliente de 2 h (desde Stock) sigue su camino y queda como CUSTOMER.
  result = await request('/api/inventory-reservations', { method: 'POST', body: { customerName: 'Cliente Stock', minutes: 120, serials: [libres[1]] } })
  assert.equal(result.status, 201, JSON.stringify(result.payload))
  eq((await unidad(libres[1])).kind, 'CUSTOMER', 'reserva de cliente = CUSTOMER')
  result = await hold(sellerA, cart('z'), [libres[1]])
  eq(result.status, 409, 'una reserva de cliente no se retiene en el carrito')
  result = await request('/api/inventory-reservations')
  ok(result.payload.some(unit => unit.serial === libres[1]), 'la reserva de cliente sí se lista')
  result = await request('/api/inventory-reservations', { method: 'PATCH', body: { action: 'release', serials: [libres[1]] } })
  eq(result.status, 200, 'liberar la reserva de cliente')
  eq(await auditoria('INVENTORY_RESERVATION_RELEASED', libres[1]), 1, 'con auditoría')

  console.log(`cart-holds: ${checks} comprobaciones OK`)
} finally {
  await db.end()
}
