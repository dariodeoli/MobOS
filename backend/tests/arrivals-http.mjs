import assert from 'node:assert/strict'
import pg from 'pg'

// #408 unidad E · API de llegada de mercadería. Pega las seis filas reales de la
// planilla «STOCK ASU 2025», concilia contra una compra abierta (EXACTO,
// POR_MODELO, SOBRANTE, NO_LLEGO), confirma con cada destino (stock, pre-vendido
// con y sin línea de pedido, otra sucursal, devolver, falta IMEI, técnico) y
// verifica: nada nace antes de confirmar, sin doble descuento de stock, IMEI
// duplicado → 409, confirmar es idempotente (también en paralelo), aislamiento
// por empresa y que VENDEDOR/CAJERA no entran.
// Uso: arrivals-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <adminOtraEmpresa> <databaseUrl>
const [base, admin, seller, cajera, gerente, adminC, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !seller || !cajera || !gerente || !adminC || !databaseUrl) throw new Error('Uso: arrivals-http.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <adminOtraEmpresa> <databaseUrl>')

let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
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
const all = async (sql, params = []) => (await db.query(sql, params)).rows

function imeiValido(base14) {
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base14[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base14 + String((10 - (suma % 10)) % 10)
}
const marca = Date.now()
const tag = marca.toString(36).toUpperCase()
let contador = 0
// El parser rechaza como «perdido por Excel» un IMEI que termina en 000: se evita ese azar.
const nuevoImei = () => { let valor; do { valor = imeiValido(`35${String(marca).slice(-6)}${String(contador++).padStart(6, '0')}`) } while (/0{3}$/.test(valor)); return valor }
const letras = (n, largo = 3) => Array.from({ length: largo }, (_, i) => String.fromCharCode(65 + Math.floor(n / 26 ** i) % 26)).join('')
const siglas = Object.fromEntries(['HH', 'MTR', 'SB', 'GTA', 'NIS'].map((k, i) => [k, `${k[0]}${letras(marca % 17576 + i * 7, 3)}`.slice(0, 4)]))
const RAMA = 'branch-a-it'
const COTIZACION = 7500
const key = sufijo => `arr-${tag}-${sufijo}`.padEnd(16, 'x')

try {
  // ── Catálogo, proveedores y datos de apoyo ───────────────────────────────
  const proveedores = {}
  for (const [nombre, sigla] of Object.entries(siglas)) {
    proveedores[nombre] = await req('/api/suppliers', 'POST', { name: `Proveedor ${nombre} ${tag}`, code: sigla }, 201)
  }
  const producto = async (name, sku) => req('/api/products', 'POST', { name, sku: `ARR-${tag}-${sku}`, category: 'Celulares', pricePyg: 9000000, costPyg: 7000000, stock: 0, branchId: RAMA }, 201)
  const p18 = await producto('iPhone 18 Pro Max 256GB Negro', '18PM')
  const p17 = await producto('iPhone 17 Pro Max 256GB Azul', '17PM')
  const pIpad = await producto("iPad Air M4 11 128GB Space Gray", 'IPAD')
  const p15 = await producto('iPhone 15 256GB Negro', '15')
  const pS26 = await producto('Samsung Galaxy S26 Ultra 12/256GB Black', 'S26')
  const p16 = await producto('iPhone 16 Pro 1TB', '16P')
  const stockDe = async id => Number((await one('SELECT stock FROM "Product" WHERE id = $1', [id])).stock)

  await db.query(`INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt") VALUES ('branch-cde-arr', 'tenant-a-it', 'CDE Ciudad del Este', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`)

  // Pedido vendido sin IMEI («#32056 klau»): el producto ya tiene una unidad serializada
  // (así la venta «sobre pedido» queda con el IMEI pendiente) y su costo sin saber.
  await req('/api/inventory-units', 'POST', { productId: p15.id, branchId: RAMA, serial: `ARRPREV${tag}`, costPyg: 4000000 }, 201)
  const clienteKlau = await req('/api/customers', 'POST', { name: `Klau ${tag}` }, 201)
  const pedido = await req('/api/orders', 'POST', {
    orderNumber: `ARR-${tag}`, customerId: clienteKlau.id,
    items: [{ productId: p15.id, description: p15.name, quantity: 1, unitPricePyg: 6000000, backorder: true }],
    payment: { method: 'CASH', amountPyg: 1000000 },
  }, 201)
  await db.query(`UPDATE "Order" SET "orderNumber" = 'ARR-#32056' WHERE id = $1`, [pedido.id])
  // Se vendió sin saber el costo (el caso real de «sobre pedido»): el costo llega con la llegada.
  await db.query('UPDATE "OrderItem" SET "costPending" = true, "unitCostPyg" = NULL, "baseUnitCostPyg" = NULL WHERE "orderId" = $1', [pedido.id])
  const lineaPedido = await one('SELECT id, "serialsPending", "costPending" FROM "OrderItem" WHERE "orderId" = $1', [pedido.id])
  assert.equal(lineaPedido.serialsPending, 1, 'la venta quedó esperando su IMEI')
  assert.equal(lineaPedido.costPending, true)
  const stockP15Antes = await stockDe(p15.id)
  assert.equal(stockP15Antes, 1)
  const inara = await req('/api/customers', 'POST', { name: `Inara ${tag}` }, 201)

  const imei = { A: nuevoImei(), B: nuevoImei(), C: nuevoImei(), D: nuevoImei(), E: nuevoImei(), F: nuevoImei(), G: nuevoImei(), H: nuevoImei() }
  const serieIpad = `${('SLTW' + tag).replace(/[^A-Z0-9]/g, 'X').slice(0, 10)}7`

  // Compra abierta para conciliar: A con su IMEI, 17 Pro Max sin IMEI y dos iPad.
  const compra = await req('/api/supply/purchases', 'POST', {
    supplierName: `Proveedor HH ${tag}`, currency: 'USD', exchangeRatePyg: COTIZACION,
    lines: [
      { productId: p18.id, quantity: 1, serials: imei.A, originalUnitCost: 1485 },
      { productId: p17.id, quantity: 1, condition: 'USED', originalUnitCost: 990 },
      { productId: pIpad.id, quantity: 2, originalUnitCost: 720 },
    ],
  }, 201)

  // ── Permisos: solo stock:manage ─────────────────────────────────────────
  for (const token of [seller, cajera]) {
    await req('/api/supply/arrivals', 'GET', undefined, 403, token)
    await req('/api/supply/arrivals', 'POST', { arrivedAt: '2026-10-12', currency: 'USD', exchangeRatePyg: COTIZACION, source: 'PEGADO', idempotencyKey: key('perm') }, 403, token)
  }
  await req('/api/supply/arrivals', 'GET', undefined, 200, gerente)

  // ── Borrador: código por empresa e idempotencia ─────────────────────────
  await req('/api/supply/arrivals', 'POST', { arrivedAt: '2026-10-12', currency: 'USD', source: 'PEGADO', idempotencyKey: key('sincot') }, 400)
  await req('/api/supply/arrivals', 'POST', { arrivedAt: 'no', currency: 'USD', exchangeRatePyg: COTIZACION, idempotencyKey: key('fecha') }, 400)
  const cuerpo = { arrivedAt: '2026-10-12', currency: 'USD', exchangeRatePyg: COTIZACION, source: 'PEGADO', branchId: RAMA, purchaseIds: [compra.id], idempotencyKey: key('uno') }
  const llegada = await req('/api/supply/arrivals', 'POST', cuerpo, 201)
  assert.match(llegada.code, /^LLG-[A-Z]{3}-\d{4}$/)
  assert.equal(llegada.status, 'BORRADOR')
  const repetida = await req('/api/supply/arrivals', 'POST', cuerpo, 200)
  assert.equal(repetida.id, llegada.id, 'la misma clave devuelve el mismo borrador')
  assert.equal((await one(`SELECT COUNT(*)::int AS n FROM "StockArrival" WHERE "tenantId" = 'tenant-a-it' AND "idempotencyKey" = $1`, [cuerpo.idempotencyKey])).n, 1)

  // ── Pegado (en seco): las seis filas reales de la planilla ──────────────
  const tsv = (...celdas) => celdas.join('\t')
  const pegado = [
    '12/10/2026',
    tsv('18 PRO MAX NEGRO 256GB LL A3473', imei.A, siglas.HH, '1485', 'TUPI'),
    tsv('17 PRO MAX 256GB AZUL 100% 61 CICLOS', imei.B, siglas.MTR, '990', 'GARANTIA MAYO 2027'),
    tsv("IPAD AIR M4 128GB 11' SPACE GRAY", serieIpad, siglas.SB, '720'),
    '07/10/2026 · VOS PEDÍS',
    tsv('15 NEGRO 256GB A/A', imei.C, siglas.GTA, '665', '#32056 klau'),
    tsv('SAMSUNG S26 ULTRA 12/256GB BLACK', imei.D, siglas.NIS, '955', `PEDIDO INARA`),
    tsv('16 PRO 1TB 100%', 'SE DEVUELVE', 'CARGAR IMEI', siglas.HH, '820', 'SE MANDA A CDE'),
  ].join('\n')
  await req(`/api/supply/arrivals/${llegada.id}/parse`, 'POST', { text: '' }, 400)
  const parseado = await req(`/api/supply/arrivals/${llegada.id}/parse`, 'POST', { text: pegado })
  assert.equal(parseado.lines.length, 7, 'seis filas + lo pedido que no llegó (segundo iPad)')
  assert.deepEqual(parseado.conciliacion, { EXACTO: 1, POR_MODELO: 2, SOBRANTE: 3, NO_LLEGO: 1 })
  const porSerial = serial => parseado.lines.find(l => l.serial === serial)
  assert.equal(porSerial(imei.A).match, 'EXACTO')
  assert.equal(porSerial(imei.B).match, 'POR_MODELO')
  assert.equal(porSerial(serieIpad).match, 'POR_MODELO')
  assert.equal(porSerial(imei.C).match, 'SOBRANTE')
  assert.equal(parseado.lines.filter(l => l.match === 'NO_LLEGO').length, 1)
  // Vínculos: «#32056» → línea del pedido; «PEDIDO INARA» → el cliente.
  assert.equal(porSerial(imei.C).orderItemId, lineaPedido.id)
  assert.equal(porSerial(imei.C).orderId, pedido.id)
  assert.equal(porSerial(imei.D).customerId, inara.id)
  assert.equal(porSerial(imei.D).orderItemId, null)
  assert.equal(porSerial(imei.B).condition, 'USED')
  assert.equal(porSerial(imei.B).batteryPct, 100)
  assert.equal(porSerial(imei.B).batteryCycles, 61)
  assert.equal(porSerial(imei.A).supplier.code, siglas.HH)
  const devuelta = parseado.lines.find(l => l.destination === 'DEVOLVER')
  assert.ok(devuelta, 'la fila «SE DEVUELVE» quedó como devolución')
  assert.equal(parseado.summary.errores, 0, JSON.stringify(parseado.lines.flatMap(l => l.issues)))
  assert.equal(parseado.summary.preVendidos, 2)
  // Dry run: ninguna unidad ni stock antes de confirmar.
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE serial = ANY($1)', [[imei.A, imei.B, imei.C, imei.D, serieIpad]])).n, 0)
  assert.equal(await stockDe(p18.id), 0)
  // Re-pegar reemplaza las líneas del borrador (no duplica).
  const reparseado = await req(`/api/supply/arrivals/${llegada.id}/parse`, 'POST', { text: pegado })
  assert.equal(reparseado.lines.length, 7)
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM "StockArrivalLine" WHERE "arrivalId" = $1', [llegada.id])).n, 7)

  // ── Errores bloquean la confirmación ────────────────────────────────────
  const mala = await req('/api/supply/arrivals', 'POST', { ...cuerpo, purchaseIds: undefined, idempotencyKey: key('mala') }, 201)
  assert.notEqual(mala.code, llegada.code)
  const conExcel = await req(`/api/supply/arrivals/${mala.id}/parse`, 'POST', { text: tsv('15 NEGRO 256GB', '3,52793E+14', siglas.GTA, '665') })
  assert.ok(conExcel.lines[0].issues.some(i => i.code === 'IMEI_EXCEL' && i.severity === 'error'))
  const bloqueo = await req(`/api/supply/arrivals/${mala.id}/confirm`, 'POST', undefined, 409)
  assert.ok(bloqueo.details.issues.length >= 1, 'el error de IMEI bloquea y se informa por fila')
  // Corregir el IMEI por PATCH limpia el error y revalida.
  const arreglada = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: imei.H })
  assert.equal(arreglada.lines[0].serial, imei.H)
  assert.ok(!arreglada.lines[0].issues.some(i => i.severity === 'error'), JSON.stringify(arreglada.lines[0].issues))
  // Serie inválida (Luhn) y destino sin sucursal también se rechazan en el PATCH/revalidación.
  const mal = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: '490154203237519' })
  assert.ok(mal.lines[0].issues.some(i => i.severity === 'error'))
  await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: imei.H, destination: 'OTRA_SUCURSAL' })
  const sinDestino = await req(`/api/supply/arrivals/${mala.id}`)
  assert.ok(sinDestino.lines[0].issues.some(i => i.code === 'SUCURSAL_DESTINO_FALTA'))
  await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, destination: 'STOCK' })
  await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: 'no-existe', note: 'x' }, 404)
  // «El IMEI es correcto»: un IMEI real terminado en 000 (Luhn ok) baja de error a aviso; sin Luhn o científico sigue bloqueando.
  const imeiCeros = '352793100006000'
  const sinConfirmar = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: imeiCeros })
  assert.ok(sinConfirmar.lines[0].issues.some(i => i.severity === 'error'), 'sin confirmar sigue bloqueando')
  const confirmado = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: imeiCeros, confirmSerial: true })
  assert.ok(!confirmado.lines[0].issues.some(i => i.severity === 'error'), JSON.stringify(confirmado.lines[0].issues))
  assert.ok(confirmado.lines[0].issues.some(i => i.code === 'IMEI_CONFIRMADO' && i.severity === 'warning'))
  const sinLuhn = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: '352793000000000', confirmSerial: true })
  assert.ok(sinLuhn.lines[0].issues.some(i => i.severity === 'error'), 'sin Luhn el forzado no alcanza')
  const cientifico = await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: '3,52793E+14', confirmSerial: true })
  assert.ok(cientifico.lines[0].issues.some(i => i.severity === 'error'), 'la notación científica nunca se fuerza')
  await req(`/api/supply/arrivals/${mala.id}/lines`, 'PATCH', { lineId: conExcel.lines[0].id, serial: imei.H })

  // ── Aislamiento por empresa ─────────────────────────────────────────────
  await req(`/api/supply/arrivals/${llegada.id}`, 'GET', undefined, 404, adminC)
  await req(`/api/supply/arrivals/${llegada.id}/parse`, 'POST', { text: pegado }, 404, adminC)
  await req(`/api/supply/arrivals/${llegada.id}/lines`, 'PATCH', { lineId: parseado.lines[0].id, note: 'x' }, 404, adminC)
  await req(`/api/supply/arrivals/${llegada.id}/confirm`, 'POST', undefined, 404, adminC)
  await req(`/api/supply/arrivals/lines/${parseado.lines[0].id}`, 'PATCH', { serial: imei.H }, 404, adminC)
  const listaC = await req('/api/supply/arrivals', 'GET', undefined, 200, adminC)
  assert.ok(!listaC.arrivals.some(a => a.id === llegada.id))
  // Otra empresa no puede colar un producto/proveedor ajeno en su llegada.
  const ajena = await fetch(`${base}/api/supply/arrivals`, { method: 'POST', headers: { Authorization: `Bearer ${adminC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ arrivedAt: '2026-10-12', currency: 'PYG', source: 'PEGADO', purchaseIds: [compra.id], idempotencyKey: key('ajena') }) })
  assert.ok([400, 404].includes(ajena.status), `la compra de otra empresa no se acepta (${ajena.status})`)
  assert.equal((await one(`SELECT COUNT(*)::int AS n FROM "StockArrival" WHERE "idempotencyKey" = $1`, [key('ajena')])).n, 0)

  // ── Confirmar: una transacción, cada destino ────────────────────────────
  const confirmada = await req(`/api/supply/arrivals/${llegada.id}/confirm`, 'POST', undefined, 200, admin, { 'Idempotency-Key': `conf-${tag}-uno-xxxxxxxx` })
  assert.equal(confirmada.status, 'CONFIRMADA')
  assert.equal(confirmada.repetida, false)
  const s = confirmada.summary
  assert.equal(s.ingresaron, 3)
  assert.equal(s.preVendidos, 2)
  assert.equal(s.devueltos, 1)
  assert.equal(s.noLlegaron, 1)
  assert.equal(s.aOtraSucursal, 0)
  assert.equal(s.sobrantes, 3)
  assert.equal(s.costUsd, 1485 + 990 + 720 + 665 + 955, 'el costo total no incluye lo devuelto ni lo que no llegó')
  assert.equal(s.costPyg, (1485 + 990 + 720 + 665 + 955) * COTIZACION)
  assert.equal(s.devueltoPyg, 820 * COTIZACION)

  const unidad = serial => one('SELECT u.*, s.code AS "supplierCode" FROM "InventoryUnit" u LEFT JOIN "Supplier" s ON s.id = u."supplierId" WHERE u.serial = $1 AND u."tenantId" = $2', [serial, 'tenant-a-it'])
  const uA = await unidad(imei.A)
  assert.equal(uA.status, 'AVAILABLE'); assert.equal(uA.supplierId, proveedores.HH.id); assert.equal(Number(uA.costPyg), 1485 * COTIZACION)
  assert.equal(uA.condition, 'NEW'); assert.equal(uA.branchId, RAMA); assert.ok(uA.internalSeq > 0, 'recibe su código interno')
  assert.equal(uA.purchaseLineId, compra.lines.find(l => l.productId === p18.id).id, 'queda vinculada a la línea de compra')
  assert.equal(uA.costCurrency, 'USD'); assert.equal(Number(uA.originalCost), 1485); assert.equal(Number(uA.exchangeRatePyg), COTIZACION)
  const uB = await unidad(imei.B)
  assert.equal(uB.condition, 'USED'); assert.equal(uB.batteryHealth, 100); assert.equal(uB.batteryCycles, 61)
  assert.equal(uB.warrantyUntil.toISOString().slice(0, 10), '2027-05-01', 'garantía: primer día del mes')
  assert.equal((await unidad(serieIpad)).status, 'AVAILABLE')
  assert.equal(await stockDe(p18.id), 1); assert.equal(await stockDe(p17.id), 1); assert.equal(await stockDe(pIpad.id), 1)
  // Pre-vendido con línea de pedido: SOLD con costo y proveedor, sin descontar stock dos veces.
  const uC = await unidad(imei.C)
  assert.equal(uC.status, 'SOLD'); assert.equal(uC.supplierId, proveedores.GTA.id); assert.equal(Number(uC.costPyg), 665 * COTIZACION)
  assert.equal(uC.soldOrderItemId, lineaPedido.id)
  assert.equal(await stockDe(p15.id), stockP15Antes, 'la venta sobre pedido no descuenta stock dos veces')
  const lineaDespues = await one('SELECT "serialsPending", "costPending", "unitCostPyg", serials FROM "OrderItem" WHERE id = $1', [lineaPedido.id])
  assert.equal(lineaDespues.serialsPending, 0); assert.equal(lineaDespues.costPending, false); assert.equal(Number(lineaDespues.unitCostPyg), 665 * COTIZACION)
  assert.deepEqual(lineaDespues.serials, [imei.C])
  // Pre-vendido sin línea: reservada para el cliente, cuenta en el stock.
  const uD = await unidad(imei.D)
  assert.equal(uD.status, 'RESERVED'); assert.equal(uD.reservationCustomerId, inara.id)
  assert.equal(await stockDe(pS26.id), 1)
  // Devolver: sin unidad (la fila no tenía compra, queda solo la nota).
  const devueltaFinal = reparseado.lines.find(l => l.destination === 'DEVOLVER')
  const lineaDev = await one('SELECT * FROM "StockArrivalLine" WHERE id = $1', [devueltaFinal.id])
  assert.equal(lineaDev.unitId, null); assert.equal(await stockDe(p16.id), 0)
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE "productId" = $1', [p16.id])).n, 0)
  assert.ok((await one(`SELECT COUNT(*)::int AS n FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND action = 'STOCK_ARRIVAL_CONFIRMED' AND "entityId" = $1`, [llegada.id])).n === 1)
  assert.ok((await one(`SELECT COUNT(*)::int AS n FROM "AuditLog" WHERE action = 'ORDER_SERIALS_ATTACHED' AND "entityId" = $1`, [pedido.id])).n >= 1)
  // El saldo de la compra: el segundo iPad sigue abierto (no llegó).
  const nuevaLlegadaIpad = await req('/api/supply/arrivals', 'POST', { ...cuerpo, idempotencyKey: key('saldo') }, 201)
  const saldo = await req(`/api/supply/arrivals/${nuevaLlegadaIpad.id}/parse`, 'POST', { text: tsv("IPAD AIR M4 128GB 11' SPACE GRAY", `${('SERB' + tag).replace(/[^A-Z0-9]/g, 'X').slice(0, 10)}8`, siglas.SB, '720') })
  assert.equal(saldo.conciliacion.POR_MODELO, 1, 'queda un iPad abierto en la compra')
  assert.equal(saldo.conciliacion.NO_LLEGO, 0)

  // Segundo confirm: mismo resumen, sin tocar nada.
  const unidadesAntes = (await one(`SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it'`)).n
  const otraVez = await req(`/api/supply/arrivals/${llegada.id}/confirm`, 'POST', undefined, 200, admin, { 'Idempotency-Key': `conf-${tag}-dos-xxxxxxxx` })
  assert.equal(otraVez.repetida, true)
  assert.deepEqual(otraVez.summary, confirmada.summary, 'el mismo resumen')
  assert.equal((await one(`SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE "tenantId" = 'tenant-a-it'`)).n, unidadesAntes)
  assert.equal(await stockDe(p18.id), 1)
  // Confirmada: ya no se edita ni se vuelve a pegar.
  await req(`/api/supply/arrivals/${llegada.id}/parse`, 'POST', { text: pegado }, 409)
  await req(`/api/supply/arrivals/${llegada.id}/lines`, 'PATCH', { lineId: devueltaFinal.id, note: 'x' }, 409)

  // ── Visibilidad: gerencia ve nombre y costos; no hay camino para vendedores ──
  const detalle = await req(`/api/supply/arrivals/${llegada.id}`, 'GET', undefined, 200, gerente)
  assert.equal(detalle.lines.find(l => l.serial === imei.A).supplier.name, `Proveedor HH ${tag}`)
  assert.equal(Number(detalle.summary.costPyg), s.costPyg)
  await req(`/api/supply/arrivals/${llegada.id}`, 'GET', undefined, 403, seller)
  await req(`/api/supply/arrivals/${llegada.id}`, 'GET', undefined, 403, cajera)
  await req(`/api/supply/arrivals/${llegada.id}/confirm`, 'POST', undefined, 403, seller)

  // ── Segunda llegada: devolver con cuenta a pagar, otra sucursal, técnico, falta IMEI, duplicado ──
  const compraDev = await req('/api/supply/purchases', 'POST', {
    supplierName: `Proveedor HH ${tag}`, currency: 'USD', exchangeRatePyg: COTIZACION, paymentCondition: 'CREDITO', dueAt: '2026-12-30',
    lines: [{ productId: p16.id, quantity: 1, originalUnitCost: 820 }],
  }, 201)
  const payable = await one(`SELECT id, notes FROM "SupplierPayable" WHERE "supplyPurchaseId" = $1`, [compraDev.id])
  assert.ok(payable, 'la compra a crédito generó su cuenta a pagar')
  const llegada2 = await req('/api/supply/arrivals', 'POST', { ...cuerpo, purchaseIds: [compraDev.id], idempotencyKey: key('dos') }, 201)
  assert.match(llegada2.code, /^LLG-[A-Z]{3}-\d{4}$/)
  assert.ok(Number(llegada2.code.slice(-4)) > Number(llegada.code.slice(-4)), 'el correlativo avanza')
  const pegado2 = [
    '13/10/2026',
    tsv('16 PRO 1TB', imei.E, siglas.HH, '820', 'SE DEVUELVE'),
    tsv('15 NEGRO 256GB', imei.F, siglas.GTA, '665', 'MANDAR CDE'),
    tsv('17 PRO MAX 256GB AZUL', imei.G, siglas.MTR, '900', 'TECNICO'),
    tsv('17 PRO MAX 256GB AZUL', 'CARGAR IMEI', siglas.MTR, '900'),
    tsv('18 PRO MAX NEGRO 256GB', imei.A, siglas.HH, '1485', 'DUPLICADO'),
  ].join('\n')
  const p2 = await req(`/api/supply/arrivals/${llegada2.id}/parse`, 'POST', { text: pegado2 })
  const l2 = destino => p2.lines.filter(l => l.destination === destino)
  assert.equal(l2('DEVOLVER').length, 1); assert.equal(l2('OTRA_SUCURSAL').length, 1); assert.equal(l2('TECNICO').length, 1); assert.equal(l2('FALTA_IMEI').length, 1)
  assert.equal(l2('OTRA_SUCURSAL')[0].destinationBranchId, 'branch-cde-arr', 'la nota «CDE» resuelve la sucursal')
  assert.equal(l2('DEVOLVER')[0].match, 'POR_MODELO', 'la devolución cubre la línea de la compra a crédito')
  // IMEI duplicado de una llegada anterior → 409 al confirmar.
  const dup = p2.lines.find(l => l.serial === imei.A)
  assert.ok(dup.issues.some(i => i.code === 'SERIAL_EXISTENTE' && i.severity === 'error'))
  const rechazo = await req(`/api/supply/arrivals/${llegada2.id}/confirm`, 'POST', undefined, 409)
  assert.ok(rechazo.details.issues.some(i => i.serial === imei.A), 'se informa qué IMEI está duplicado')
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE serial = ANY($1)', [[imei.E, imei.F, imei.G]])).n, 0, 'el rechazo no deja unidades a medias')
  assert.equal(await stockDe(p15.id), stockP15Antes)
  // Se corrige el duplicado por PATCH y se confirma dos veces en paralelo: solo una escribe.
  await req(`/api/supply/arrivals/${llegada2.id}/lines`, 'PATCH', { lineId: dup.id, serial: imei.H })
  const [c1, c2] = await Promise.all([
    req(`/api/supply/arrivals/${llegada2.id}/confirm`, 'POST', undefined, 200),
    req(`/api/supply/arrivals/${llegada2.id}/confirm`, 'POST', undefined, 200),
  ])
  assert.equal([c1, c2].filter(r => r.repetida === false).length, 1, 'una confirma y la otra devuelve el mismo resumen')
  assert.deepEqual(c1.summary, c2.summary)
  assert.equal(c1.summary.devueltos, 1); assert.equal(c1.summary.aOtraSucursal, 1); assert.equal(c1.summary.tecnico, 1); assert.equal(c1.summary.faltaImei, 1); assert.equal(c1.summary.ingresaron, 1)
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM "InventoryUnit" WHERE serial = ANY($1)', [[imei.E, imei.F, imei.G, imei.H]])).n, 3, 'F, G y H; E se devuelve')

  // Devolver: nota en la cuenta a pagar de la compra, sin ingreso ni cambio de monto.
  const payableDespues = await one(`SELECT notes, "amountPyg" FROM "SupplierPayable" WHERE id = $1`, [payable.id])
  assert.ok(String(payableDespues.notes).includes(llegada2.code) && String(payableDespues.notes).includes(imei.E), payableDespues.notes)
  assert.equal(Number(payableDespues.amountPyg), 820 * COTIZACION, 'el monto de la cuenta no cambia')
  // Otra sucursal: unidad en tránsito hacia CDE con su traslado, origen sin stock de más.
  const uF = await unidad(imei.F)
  assert.equal(uF.status, 'IN_TRANSIT'); assert.equal(uF.branchId, 'branch-cde-arr')
  const lineaF = await one('SELECT "transferId" FROM "StockArrivalLine" WHERE "arrivalId" = $1 AND serial = $2', [llegada2.id, imei.F])
  assert.ok(lineaF.transferId, 'la línea guarda su traslado')
  assert.equal((await one('SELECT "destinationBranchId", "sourceBranchId" FROM "StockTransfer" WHERE id = $1', [lineaF.transferId])).destinationBranchId, 'branch-cde-arr')
  assert.equal(await stockDe(p15.id), stockP15Antes, 'el stock origen queda igual: entró y salió')
  // Técnico: en ubicación con ícono TALLER y no vendible.
  const uG = await unidad(imei.G)
  assert.equal(uG.status, 'DEFECTIVE'); assert.ok(String(uG.notes).startsWith('NO VENDER'))
  assert.equal((await one('SELECT icon FROM "StockLocation" WHERE id = $1', [uG.locationId])).icon, 'TALLER')
  assert.equal(await stockDe(p17.id), 1, 'la unidad de técnico no suma stock vendible')
  assert.equal(await stockDe(p18.id), 2, 'la unidad corregida (H) sí ingresó')
  // Falta IMEI: sin unidad hasta cargarlo.
  const pendiente = (await req(`/api/supply/arrivals/${llegada2.id}`)).lines.find(l => l.destination === 'FALTA_IMEI')
  assert.equal(pendiente.unitId, null)

  // ── Completar el IMEI faltante tras confirmar ───────────────────────────
  await req(`/api/supply/arrivals/lines/${pendiente.id}`, 'PATCH', { serial: '490154203237519' }, 400)
  await req(`/api/supply/arrivals/lines/${pendiente.id}`, 'PATCH', { serial: imei.A }, 409)
  const stock17Antes = await stockDe(p17.id)
  const completada = await req(`/api/supply/arrivals/lines/${pendiente.id}`, 'PATCH', { serial: imei.E })
  assert.ok(completada.unitId)
  const uE = await unidad(imei.E)
  assert.equal(uE.status, 'AVAILABLE'); assert.equal(uE.productId, p17.id); assert.equal(Number(uE.costPyg), 900 * COTIZACION); assert.equal(uE.supplierId, proveedores.MTR.id)
  assert.equal(await stockDe(p17.id), stock17Antes + 1)
  assert.equal(completada.summary.faltaImei, 0); assert.equal(completada.summary.ingresaron, 2)
  await req(`/api/supply/arrivals/lines/${pendiente.id}`, 'PATCH', { serial: imei.B }, 409)

  // ── Listado ─────────────────────────────────────────────────────────────
  const lista = await req('/api/supply/arrivals?status=CONFIRMADA')
  assert.ok(lista.arrivals.some(a => a.id === llegada.id) && lista.arrivals.some(a => a.id === llegada2.id))
  assert.ok(lista.arrivals.every(a => a.status === 'CONFIRMADA'))
  const secuencia = await one(`SELECT "next" FROM "TenantSequence" WHERE "tenantId" = 'tenant-a-it' AND key = 'arrival'`)
  assert.ok(Number(secuencia.next) >= 5, 'el correlativo vive en TenantSequence')
  console.log(`Llegada de mercadería (#408 E): ${checks} verificaciones HTTP ok.`)
} finally {
  await db.query(`UPDATE "Branch" SET "isActive" = false WHERE id = 'branch-cde-arr'`).catch(() => undefined)
  await db.end()
}
