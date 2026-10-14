import assert from 'node:assert/strict'
import pg from 'pg'

// U2 · GET /api/stock/items y redacción de costos en GET /api/inventory-units,
// por HTTP contra una base real: unión unidades + productos, cursor estable,
// totales = filas filtradas, alcance por tenant/sucursal/rol y selector del POS.
const [baseUrl, adminToken, sellerToken, cajeraToken, gerenteToken, sellerBToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !gerenteToken || !sellerBToken || !databaseUrl) throw new Error('Uso: stock-items.mjs <baseUrl> <admin> <seller> <cajera> <gerente> <sellerB> <databaseUrl>')

// IP propia: el arnés comparte el cupo de 120 pedidos/min de 127.0.0.1 entre todas las suites sin IP.
const CLIENT_IP = '198.51.100.61'
async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant, 'x-forwarded-for': CLIENT_IP, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { response, payload: await response.json().catch(() => null) }
}
const db = new pg.Client({ connectionString: databaseUrl })
await db.connect()
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const BRANCH = 'branch-a-it'
const list = async (query = '', token = adminToken, tenant) => request(`/api/stock/items?${query}`, { token, tenant })
const ok = async (query, token, tenant) => { const result = await list(query, token, tenant); assert.equal(result.response.status, 200, `${query}: ${JSON.stringify(result.payload)}`); return result.payload }

try {
  const marca = Date.now()
  const tag = `U2${marca}`
  // Datos: producto serializado con 5 unidades (costo, proveedor, consignación) y un accesorio con stock 7.
  let result = await request('/api/products', { method: 'POST', body: { sku: `${tag}-EQ`, name: `Equipo ${tag}`, category: 'Celulares', model: 'U2', capacity: '128GB', color: 'Negro', pricePyg: 3000000, costPyg: 2000000, stock: 1, branchId: BRANCH, imei: `${tag}-0` } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const equipo = result.payload
  const serials = [1, 2, 3, 4].map(n => `${tag}-${n}`)
  result = await request('/api/inventory-units', { method: 'POST', body: { productId: equipo.id, branchId: BRANCH, serials, costPyg: 2100000, supplierName: `Proveedor ${tag}`, consignorName: 'Ana', consignorPyg: 1900000, batteryHealth: 88 } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  result = await request('/api/products', { method: 'POST', body: { sku: `${tag}-ACC`, name: `Funda ${tag}`, category: 'Fundas', pricePyg: 50000, costPyg: 20000, stock: 7, branchId: BRANCH } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const accesorio = result.payload
  const unidadesDb = (await db.query('SELECT id, serial FROM "InventoryUnit" WHERE "productId" = $1 ORDER BY "createdAt", id', [equipo.id])).rows
  assert.equal(unidadesDb.length, 5)

  // 1) Forma de fila, unión y totales = filas filtradas.
  let page = await ok(`q=${tag}&limit=200`)
  assert.equal(page.items.length, 6, 'cinco unidades + un accesorio')
  assert.equal(page.hasMore, false)
  assert.equal(page.totals.total, page.items.length, 'totales = filas del filtro')
  assert.equal(page.totals.byRowKind.unit, 5)
  assert.equal(page.totals.byRowKind.product, 1)
  assert.equal(page.totals.byKind.EQUIPO, 5)
  assert.equal(page.totals.byKind.ACCESORIO, 1)
  const unidad = page.items.find(row => row.kind === 'unit' && row.serial === unidadesDb[1].serial)
  assert.ok(unidad, 'la unidad aparece')
  assert.deepEqual(Object.keys(unidad).sort(), ['batteryHealth', 'branchId', 'branchName', 'consignorName', 'costPyg', 'createdAt', 'id', 'kind', 'locationId', 'locationName', 'model', 'name', 'productId', 'quantity', 'serial', 'sku', 'soldAt', 'status', 'stockKind', 'supplierId', 'supplierName'])
  assert.equal(unidad.status, 'disponible'); assert.equal(unidad.quantity, 1); assert.equal(unidad.stockKind, 'EQUIPO')
  assert.equal(unidad.costPyg, 2100000); assert.equal(unidad.supplierName, `Proveedor ${tag}`); assert.equal(unidad.batteryHealth, 88)
  assert.match(unidad.model, /U2 128GB Negro/)
  const producto = page.items.find(row => row.kind === 'product')
  assert.equal(producto.id, accesorio.id); assert.equal(producto.quantity, 7); assert.equal(producto.costPyg, 20000); assert.equal(producto.serial, null); assert.equal(producto.status, 'disponible'); assert.equal(producto.stockKind, 'ACCESORIO')
  assert.equal(producto.branchName, 'Sucursal A')
  const totalesPorEstado = await ok(`q=${tag}&kind=unit`)
  assert.equal(totalesPorEstado.totals.total, 5)
  assert.equal((await ok(`q=${tag}&stockKind=ACCESORIO`)).items.length, 1)
  assert.equal((await ok(`q=${encodeURIComponent(unidadesDb[2].serial)}`)).items.length, 1, 'búsqueda por IMEI')
  assert.equal((await ok(`productId=${equipo.id}`)).totals.total, 5)
  assert.equal((await ok(`q=${tag}&supplierId=no-existe`)).totals.total, 0)

  // 2) Cursor estable aunque se editen filas entre páginas (updatedAt cambia).
  const completo = (await ok(`q=${tag}&limit=200`)).items.map(row => row.id)
  const visto = []
  let cursor = null
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const tramo = await ok(`q=${tag}&limit=2${cursor ? `&cursor=${cursor}` : ''}`)
    assert.ok(tramo.items.length <= 2)
    assert.equal(tramo.totals.total, 6, 'los totales no dependen del cursor ni del límite')
    visto.push(...tramo.items.map(row => row.id))
    // Edición entre páginas: sube updatedAt de todas las filas del conjunto.
    await db.query('UPDATE "InventoryUnit" SET "updatedAt" = now() + interval \'1 hour\' WHERE "productId" = $1', [equipo.id])
    await db.query('UPDATE "Product" SET "updatedAt" = now() + interval \'1 hour\' WHERE id = ANY($1)', [[equipo.id, accesorio.id]])
    if (!tramo.hasMore) break
    cursor = tramo.nextCursor
    assert.ok(cursor, 'hasMore trae nextCursor')
  }
  assert.deepEqual(visto, completo, 'mismas filas y mismo orden, sin repetidas ni salteadas')
  assert.equal(new Set(visto).size, 6)
  // Un cursor inválido es un 400 explícito.
  assert.equal((await list('cursor=basura')).response.status, 400)

  // 3) Límite: tope 200 aplicado y avisado.
  assert.equal((await ok('limit=100000')).limit, 200)
  assert.equal((await ok('')).limit, 50)

  // 4) Estados: reservado/vendido/defectuoso/eliminado.
  const [u0, u1, u2, u3, u4] = unidadesDb
  await db.query(`UPDATE "InventoryUnit" SET status = 'RESERVED' WHERE id = $1`, [u1.id])
  await db.query(`UPDATE "InventoryUnit" SET status = 'DEFECTIVE' WHERE id = $1`, [u2.id])
  await db.query(`UPDATE "InventoryUnit" SET status = 'IN_TRANSIT' WHERE id = $1`, [u3.id])
  result = await request('/api/inventory-units', { method: 'PATCH', body: { id: u4.id, action: 'remove', reason: 'Baja U2' } })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  assert.equal((await ok(`q=${tag}&status=reservado`)).totals.total, 1)
  assert.equal((await ok(`q=${tag}&status=defectuoso`)).totals.total, 1)
  assert.equal((await ok(`q=${tag}&status=en_transito`)).totals.total, 1)
  const eliminados = await ok(`q=${tag}&status=eliminado`)
  assert.equal(eliminados.totals.total, 1); assert.equal(eliminados.items[0].status, 'eliminado'); assert.equal(eliminados.items[0].id, u4.id)
  const porDefecto = await ok(`q=${tag}&limit=200`)
  assert.ok(!porDefecto.items.some(row => row.id === u4.id), 'la baja no aparece sin pedirla')
  assert.equal(porDefecto.totals.byStatus.eliminado, undefined)
  assert.equal((await ok(`q=${tag}&status=disponible`)).totals.total, 2, 'u0 + accesorio')

  // 5) Venta: la unidad y el accesorio salen en «vendido» con rango de fechas.
  result = await request('/api/orders', { method: 'POST', body: { items: [{ productId: equipo.id, description: equipo.name, quantity: 1, unitPricePyg: 3000000, inventoryUnitSerials: [u0.serial] }, { productId: accesorio.id, description: accesorio.name, quantity: 2, unitPricePyg: 50000 }] } })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const hoy = new Date().toISOString().slice(0, 10)
  const vendido = await ok(`q=${tag}&status=vendido&from=${hoy}&to=${hoy}`)
  assert.equal(vendido.totals.total, 2)
  const unidadVendida = vendido.items.find(row => row.kind === 'unit')
  assert.equal(unidadVendida.id, u0.id); assert.equal(unidadVendida.status, 'vendido'); assert.ok(unidadVendida.soldAt)
  const productoVendido = vendido.items.find(row => row.kind === 'product')
  assert.equal(productoVendido.quantity, 2, 'cantidad vendida en el rango'); assert.equal(productoVendido.status, 'vendido')
  assert.equal((await ok(`q=${tag}&status=vendido&from=2020-01-01&to=2020-01-02`)).totals.total, 0, 'fuera del rango no hay ventas')

  // 6) Costos y proveedor: solo ADMIN y GERENTE (ambos endpoints).
  for (const [nombre, token, veCosto] of [['admin', adminToken, true], ['gerente', gerenteToken, true], ['vendedor', sellerToken, false], ['cajera', cajeraToken, false]]) {
    const listado = await ok(`q=${tag}&limit=200`, token)
    assert.ok(listado.items.length >= 1, `${nombre} ve filas de su sucursal`)
    for (const row of listado.items) {
      if (veCosto) assert.notEqual(row.costPyg, null, `${nombre} ve costo (${row.kind})`)
      else assert.deepEqual([row.costPyg, row.supplierId, row.supplierName], [null, null, null], `${nombre} no ve costo/proveedor`)
    }
    assert.equal((await list(`status=eliminado&q=${tag}`, token)).payload.totals.total, nombre === 'admin' ? 1 : 0, `${nombre}: eliminado solo ADMIN`)
    const unidadesApi = await request(`/api/inventory-units?branchId=${BRANCH}&q=${encodeURIComponent(tag)}`, { token })
    assert.equal(unidadesApi.response.status, 200)
    const filaApi = unidadesApi.payload.find(row => row.serial === u2.serial.toUpperCase().replace(/[\s-]+/g, ''))
    assert.ok(filaApi, `${nombre}: el selector sigue encontrando la unidad`)
    for (const campo of ['costPyg', 'originalCost', 'consignorPyg', 'supplierId', 'supplierName']) {
      if (veCosto) assert.notEqual(filaApi[campo], undefined, campo)
      else assert.equal(filaApi[campo], null, `${nombre}: ${campo} oculto`)
    }
    assert.equal('supplier' in filaApi, veCosto)
    if (veCosto) { assert.ok(Number(filaApi.costPyg) > 0); assert.ok(Number(filaApi.consignorPyg) > 0) }
  }
  assert.equal((await list(`supplierId=cualquiera`, sellerToken)).response.status, 403, 'el filtro por proveedor tampoco se filtra al vendedor')
  assert.equal((await list(`supplierId=cualquiera`, cajeraToken)).response.status, 403)
  // La baja sigue oculta para no-ADMIN también en Unidades.
  assert.deepEqual((await request(`/api/inventory-units?view=removed&q=${tag}`, { token: sellerToken })).payload, [])

  // 7) Selector de IMEI del POS: unidades de un producto en su sucursal, disponibles.
  result = await request(`/api/inventory-units?productId=${equipo.id}&branchId=${BRANCH}&status=AVAILABLE`, { token: sellerToken })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.payload, [], 'u0 se vendió; el resto no está disponible')
  await db.query(`UPDATE "InventoryUnit" SET status = 'AVAILABLE' WHERE id = ANY($1)`, [[u1.id, u2.id, u3.id]])
  result = await request(`/api/inventory-units?productId=${equipo.id}&branchId=${BRANCH}&status=AVAILABLE`, { token: sellerToken })
  assert.equal(result.payload.length, 3)
  for (const fila of result.payload) { assert.ok(fila.id && fila.serial && fila.status === 'AVAILABLE' && fila.productId === equipo.id && fila.branchId === BRANCH); assert.equal(fila.costPyg, null) }

  // 8) Alcance: VENDEDOR/CAJERA no salen de su sucursal; otro tenant no ve nada.
  assert.equal((await list('branchId=branch-a2-it', sellerToken)).response.status, 403)
  assert.equal((await list('branchId=branch-a2-it', cajeraToken)).response.status, 403)
  const deB = await list(`q=${tag}&limit=200`, sellerBToken, 'tenant-b-it')
  assert.equal(deB.response.status, 200)
  assert.equal(deB.payload.items.length, 0, 'otro tenant no ve filas ajenas')
  assert.equal(deB.payload.totals.total, 0)
  const falsificado = await list(`q=${tag}&limit=200`, sellerBToken, 'tenant-a-it')
  assert.equal(falsificado.payload?.items?.length ?? 0, 0, 'el header x-tenant-id no cambia el tenant de la sesión')
  assert.equal((await list(`branchId=${BRANCH}`, sellerBToken, 'tenant-b-it')).response.status, 403, 'la sucursal de otro tenant no es la efectiva del vendedor')
  assert.equal((await ok(`productId=${equipo.id}`, sellerBToken, 'tenant-b-it')).totals.total, 0, 'pasar un producto ajeno no devuelve nada')
  assert.equal((await ok(`productId=${equipo.id}`, adminToken)).totals.total, 4, 'el administrador del tenant dueño sí lo ve (sin la baja)')
  const sinSesion = await fetch(`${baseUrl}/api/stock/items`)
  assert.equal(sinSesion.status, 401)

  console.log('stock-items: OK')
} finally {
  await db.end()
}
