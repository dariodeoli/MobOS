import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStockItemsPageSql, buildStockItemsTotalsSql, buildStockTotals, decodeStockCursor, encodeStockCursor, mapStockRow,
  paginateStockRows, parseStockItemsQuery, redactStockItem, redactUnitCosts, STOCK_ITEMS_DEFAULT_LIMIT, STOCK_ITEMS_MAX_LIMIT,
  type StockItemsFilters, type StockItemsScope,
} from '../lib/stock-items'

// U2 · Lista unificada de Stock: partes puras (cursor, filtros → SQL, redacción).
// El comportamiento contra Postgres se prueba en tests/stock-items.mjs.

const parse = (query: string) => {
  const result = parseStockItemsQuery(new URLSearchParams(query))
  assert.ok(!('error' in result), 'error' in result ? result.error : '')
  return result as Exclude<typeof result, { error: string }>
}
const scope = (extra: Partial<StockItemsScope> = {}): StockItemsScope => ({ tenantId: 'tenant-x', forcedBranchId: null, canSeeCost: true, canSeeSupplier: true, canSeeRemoved: true, ...extra })
const filtersOf = (query = '') => parse(query).filters
const sqlOf = (sql: { text: string }) => sql.text.replace(/\s+/g, ' ')

test('cursor: codifica y decodifica (sortKey, id) y rechaza basura', () => {
  const encoded = encodeStockCursor({ sortKey: new Date('2026-10-13T10:20:30.123Z'), id: 'abc' })
  assert.deepEqual(decodeStockCursor(encoded), { sortKey: '2026-10-13T10:20:30.123Z', id: 'abc' })
  assert.equal(decodeStockCursor(null), null)
  assert.equal(decodeStockCursor('no-es-base64-json'), null)
  assert.equal(decodeStockCursor(Buffer.from(JSON.stringify(['no-fecha', 'x'])).toString('base64url')), null)
  assert.equal(decodeStockCursor(Buffer.from(JSON.stringify(['2026-10-13T00:00:00Z'])).toString('base64url')), null)
  assert.equal(decodeStockCursor(Buffer.from(JSON.stringify(['2026-10-13T00:00:00Z', 5])).toString('base64url')), null)
  assert.equal(parse('limit=5').cursor, null)
  assert.deepEqual(parseStockItemsQuery(new URLSearchParams('cursor=basura')), { error: 'Cursor inválido.' })
})

test('filtros: límite por defecto 50, tope 200 y validación de enums y fechas', () => {
  assert.equal(filtersOf().limit, STOCK_ITEMS_DEFAULT_LIMIT)
  assert.equal(filtersOf('limit=10').limit, 10)
  assert.equal(filtersOf('limit=5000').limit, STOCK_ITEMS_MAX_LIMIT)
  assert.equal(filtersOf('limit=0').limit, STOCK_ITEMS_DEFAULT_LIMIT)
  assert.equal(filtersOf('limit=abc').limit, STOCK_ITEMS_DEFAULT_LIMIT)
  assert.equal(filtersOf('kind=unit').rowKind, 'unit')
  assert.equal(filtersOf('kind=accesorio').stockKind, 'ACCESORIO')
  assert.equal(filtersOf('stockKind=repuesto').stockKind, 'REPUESTO')
  assert.deepEqual(parseStockItemsQuery(new URLSearchParams('kind=otra-cosa')), { error: 'Tipo de fila inválido.' })
  assert.deepEqual(parseStockItemsQuery(new URLSearchParams('stockKind=xx')), { error: 'Tipo de stock inválido.' })
  assert.deepEqual(parseStockItemsQuery(new URLSearchParams('status=SOLD')), { error: 'Estado de stock inválido.' })
  assert.deepEqual(parseStockItemsQuery(new URLSearchParams('from=ayer')), { error: 'Fecha inválida.' })
  // Una fecha sola en `to` incluye todo ese día (cota exclusiva = día siguiente).
  assert.equal(filtersOf('to=2026-10-13').toExclusive?.toISOString(), '2026-10-14T00:00:00.000Z')
  assert.equal(filtersOf('from=2026-10-01').from?.toISOString(), '2026-10-01T00:00:00.000Z')
})

test('SQL: cada rama del UNION lleva tenantId y ningún dato del usuario entra al texto', () => {
  const hostile = "x'; DROP TABLE \"Product\"; --"
  const filters = filtersOf(`q=${encodeURIComponent(hostile)}&branchId=${encodeURIComponent(hostile)}&productId=${encodeURIComponent(hostile)}`)
  const page = buildStockItemsPageSql(filters, scope(), null)!
  const text = sqlOf(page)
  assert.ok(!text.includes('DROP TABLE'), 'el texto del usuario va en parámetros')
  assert.ok(page.values.some(value => typeof value === 'string' && value.includes('DROP TABLE')))
  assert.equal(page.values.filter(value => value === 'tenant-x').length >= 3, true, 'tenant en cada rama (unidades, producto de la unidad, productos)')
  assert.equal((text.match(/UNION ALL/g) || []).length, 1)
  assert.match(text, /"InventoryUnit" u JOIN "Product" p/)
  const unitsBranch = text.split('UNION ALL')[0]
  const productsBranch = text.split('UNION ALL')[1]
  assert.match(unitsBranch, /u\."tenantId" = \$\d+/)
  assert.match(productsBranch, /p\."tenantId" = \$\d+/)
  assert.match(productsBranch, /NOT EXISTS \(SELECT 1 FROM "InventoryUnit" iu WHERE iu\."tenantId" = \$\d+/)
})

test('SQL: kind, estado y proveedor recortan las ramas que corresponden', () => {
  const unitOnly = sqlOf(buildStockItemsPageSql(filtersOf('kind=unit'), scope(), null)!)
  assert.ok(!unitOnly.includes('UNION ALL') && !unitOnly.includes('FROM "Product" p LEFT JOIN'))
  const productOnly = sqlOf(buildStockItemsPageSql(filtersOf('kind=product'), scope(), null)!)
  assert.ok(!productOnly.includes('FROM "InventoryUnit" u'))
  // Un estado de unidad no alcanza a los productos; «vendido» sí (suma de OrderItem).
  assert.ok(!sqlOf(buildStockItemsPageSql(filtersOf('status=reservado'), scope(), null)!).includes('UNION ALL'))
  const vendido = sqlOf(buildStockItemsPageSql(filtersOf('status=vendido&from=2026-10-01&to=2026-10-31'), scope(), null)!)
  assert.match(vendido, /JOIN LATERAL \(SELECT COALESCE\(SUM\(oi\."quantity"\)/)
  assert.match(vendido, /COALESCE\(u\."soldAt", u\."createdAt"\)/)
  assert.match(vendido, /o\."tenantId" = \$\d+/)
  // Proveedor y ubicación solo existen en unidades.
  const porProveedor = sqlOf(buildStockItemsPageSql(filtersOf('supplierId=s1'), scope(), null)!)
  assert.ok(!porProveedor.includes('UNION ALL'))
  assert.ok(!sqlOf(buildStockItemsPageSql(filtersOf('stockKind=EQUIPO'), scope(), null)!).includes('FROM "Product" p LEFT JOIN'))
  // Sin estado: nunca se listan las bajas.
  assert.match(sqlOf(buildStockItemsPageSql(filtersOf(), scope(), null)!), /u\."removedAt" IS NULL/)
})

test('SQL: eliminado solo para ADMIN y sucursal forzada por el rol', () => {
  assert.equal(buildStockItemsPageSql(filtersOf('status=eliminado'), scope({ canSeeRemoved: false }), null), null)
  assert.equal(buildStockItemsTotalsSql(filtersOf('status=eliminado'), scope({ canSeeRemoved: false })), null)
  const admin = buildStockItemsPageSql(filtersOf('status=eliminado'), scope(), null)!
  assert.match(sqlOf(admin), /u\."removedAt" IS NOT NULL/)
  assert.ok(!sqlOf(admin).includes('UNION ALL'), 'los productos no tienen bajas')
  const forced = scope({ forcedBranchId: 'branch-1' })
  assert.equal(buildStockItemsPageSql(filtersOf('branchId=branch-2'), forced, null), null, 'otra sucursal no devuelve nada')
  const page = buildStockItemsPageSql(filtersOf('branchId=branch-1'), forced, null)!
  assert.ok(page.values.includes('branch-1'))
  const own = buildStockItemsPageSql(filtersOf(), forced, null)!
  assert.equal(own.values.filter(value => value === 'branch-1').length, 2, 'unidades y productos acotados a la sucursal')
})

test('SQL: sin permiso de costos el SQL ni siquiera selecciona costo ni id de proveedor', () => {
  const text = sqlOf(buildStockItemsPageSql(filtersOf(), scope({ canSeeCost: false, canSeeSupplier: false }), null)!)
  assert.ok(!text.includes('u."costPyg"') && !text.includes('p."costPyg"') && !text.includes('u."supplierId" AS'))
  const withCost = sqlOf(buildStockItemsPageSql(filtersOf(), scope(), null)!)
  assert.ok(withCost.includes('u."costPyg"') && withCost.includes('p."costPyg"') && withCost.includes('"Supplier" s'))
})

test('SQL (#400): sin permiso de ver el proveedor el SQL no selecciona su nombre, solo la sigla', () => {
  for (const canSeeCost of [true, false]) {
    const text = sqlOf(buildStockItemsPageSql(filtersOf(), scope({ canSeeCost, canSeeSupplier: false }), null)!)
    assert.ok(!text.includes('s."name"') && !text.includes('u."supplierName") AS') && text.includes('s."code"'), `canSeeCost=${canSeeCost}`)
  }
  assert.ok(sqlOf(buildStockItemsPageSql(filtersOf(), scope(), null)!).includes('COALESCE(s."name", u."supplierName")'))
})

test('SQL: cursor compara (sortKey, id) en cada rama, con createdAt (soldAt en vendido)', () => {
  const cursor = { sortKey: '2026-10-13T10:00:00.000Z', id: 'u-9' }
  const page = buildStockItemsPageSql(filtersOf('limit=3'), scope(), cursor)!
  const text = sqlOf(page)
  assert.equal((text.match(/\(u\."createdAt", u\."id"\) < \(\$\d+::timestamp, \$\d+\)/g) || []).length, 1)
  assert.equal((text.match(/\(p\."createdAt", p\."id"\) < \(\$\d+::timestamp, \$\d+\)/g) || []).length, 1)
  assert.ok(!text.includes('updatedAt'), 'ordenar por updatedAt correría las páginas al editar')
  assert.ok(page.values.includes(4), 'pide limit+1 para saber si hay más')
  assert.match(sqlOf(buildStockItemsPageSql(filtersOf('status=vendido'), scope(), cursor)!), /\(COALESCE\(u\."soldAt", u\."createdAt"\), u\."id"\) < /)
  // El conteo ignora cursor y límite: totales = filas del filtro completo.
  const totals = buildStockItemsTotalsSql(filtersOf('limit=3'), scope())!
  assert.ok(!sqlOf(totals).includes('LIMIT') && !totals.values.includes('u-9'))
  assert.match(sqlOf(totals), /GROUP BY "kind", "stockKind", "status"/)
})

test('q: escapa comodines LIKE y normaliza IMEI', () => {
  const page = buildStockItemsPageSql(filtersOf(`q=${encodeURIComponent('MOBOS:35-12%_')}`), scope(), null)!
  assert.ok(page.values.includes('%35\\-12\\%\\_%') === false)
  assert.ok(page.values.some(value => value === '%3512\\%\\_%'), 'serial normalizado y escapado')
  assert.ok(page.values.some(value => value === '%35-12\\%\\_%'), 'crudo para SKU y nombre')
})

test('SQL vendido: solo pedidos no cancelados (lista explícita) y acotados a la sucursal forzada o filtrada', () => {
  const forzada = sqlOf(buildStockItemsPageSql(filtersOf('status=vendido'), scope({ forcedBranchId: 'br-1' }), null)!)
  assert.match(forzada, /o\."status"::text IN \('COMPLETED', 'PENDING'\)/)
  assert.doesNotMatch(forzada, /<> 'CANCELLED'/)
  assert.match(forzada, /o\."branchId" = \$\d+/)
  assert.match(sqlOf(buildStockItemsPageSql(filtersOf('status=vendido&branchId=br-2'), scope(), null)!), /o\."branchId" = \$\d+/)
  assert.doesNotMatch(sqlOf(buildStockItemsPageSql(filtersOf('status=vendido'), scope(), null)!), /o\."branchId"/)
})

test('SQL estado: IN_TRANSIT explícito y un estado desconocido conserva su valor', () => {
  const sql = sqlOf(buildStockItemsPageSql(filtersOf('rowKind=unit'), scope(), null)!)
  assert.match(sql, /WHEN u\."status" = 'IN_TRANSIT' THEN 'en_transito' ELSE u\."status"::text END/)
})

test('mapeo y redacción: costo, proveedor y consignación nulos sin permiso; BigInt a número', () => {
  const row = { id: 'u1', kind: 'unit', stockKind: 'EQUIPO', productId: 'p1', sku: 'S', model: '15 128 Negro', name: 'iPhone', serial: 'IMEI1', batteryHealth: 91, supplierId: 'sup', supplierName: 'Prov', consignorName: 'Ana', costPyg: BigInt(4200000), status: 'disponible', quantity: 1, branchId: 'b', branchName: 'Sucursal', locationId: null, locationName: null, createdAt: new Date(), soldAt: null }
  assert.equal(mapStockRow(row, true, true).costPyg, 4200000)
  assert.equal(mapStockRow(row, true, true).supplierName, 'Prov')
  const oculto = mapStockRow(row, false, true)
  assert.equal(mapStockRow(row, true, true).consignorName, 'Ana')
  assert.deepEqual([oculto.costPyg, oculto.supplierId, oculto.consignorName], [null, null, null])
  assert.deepEqual(redactStockItem({ costPyg: 1, supplierId: 'a', supplierName: 'b', consignorName: 'c', x: 1 }, false, true), { costPyg: null, supplierId: null, supplierName: 'b', consignorName: null, x: 1 })
  // Sin permiso de proveedor solo sale la sigla, con o sin permiso de costos.
  for (const verCosto of [true, false]) {
    assert.equal(redactStockItem({ costPyg: 1, supplierId: 'a', supplierName: 'Mayorista Real', supplierCode: 'MR', x: 1 }, verCosto, false).supplierName, 'MR')
    assert.equal(redactStockItem({ costPyg: 1, supplierId: 'a', supplierName: 'Mayorista Real', x: 1 }, verCosto, false).supplierName, null)
  }

  const unidad = { id: 'u', serial: 'IMEI', costPyg: BigInt(10), originalCost: '5', exchangeRatePyg: '7000', consignorPyg: BigInt(3), consignorName: 'Ana', consignorPhone: '0981', costCurrency: 'USD', supplierId: 's', supplierName: 'P', supplier: { id: 's' }, inspection: { grado: 'A', costoRepuestosPyg: 80000 }, status: 'AVAILABLE' }
  assert.equal(redactUnitCosts(unidad, true, true), unidad)
  const redacted = redactUnitCosts(unidad, false, false) as Record<string, any>
  for (const field of ['costPyg', 'originalCost', 'exchangeRatePyg', 'consignorPyg', 'consignorName', 'consignorPhone', 'costCurrency']) assert.equal(redacted[field], null, field)
  assert.deepEqual(redacted.supplier, { id: 's', code: 'S/S' })
  assert.equal(redacted.supplierName, 'S/S')
  assert.equal(redacted.inspection.costoRepuestosPyg, null)
  assert.equal(redacted.inspection.grado, 'A')
  assert.equal(redacted.serial, 'IMEI', 'el selector de IMEI sigue recibiendo serial, estado y producto')
  assert.equal(unidad.costPyg, BigInt(10), 'no muta el original')
})

test('paginación y totales: limit+1 decide hasMore y el cursor sale de la última fila', () => {
  const rows = [1, 2, 3, 4].map(n => ({ id: `r${n}`, sortKey: new Date(Date.UTC(2026, 9, 13, 10, 0, 10 - n)) }))
  const { page, hasMore, nextCursor } = paginateStockRows(rows, 3)
  assert.equal(page.length, 3)
  assert.equal(hasMore, true)
  assert.deepEqual(decodeStockCursor(nextCursor), { sortKey: '2026-10-13T10:00:07.000Z', id: 'r3' })
  const last = paginateStockRows(rows.slice(0, 3), 3)
  assert.equal(last.hasMore, false)
  assert.equal(last.nextCursor, null)
  const totals = buildStockTotals([
    { kind: 'unit', stockKind: 'EQUIPO', status: 'disponible', count: 4 },
    { kind: 'unit', stockKind: 'EQUIPO', status: 'vendido', count: 2 },
    { kind: 'product', stockKind: 'ACCESORIO', status: 'disponible', count: 5 },
  ])
  assert.deepEqual(totals, { total: 11, byStatus: { disponible: 9, vendido: 2 }, byKind: { EQUIPO: 6, ACCESORIO: 5 }, byRowKind: { unit: 6, product: 5 } })
})

test('filtros sin estado ni tipo usan los defaults esperados', () => {
  const filters: StockItemsFilters = filtersOf()
  assert.deepEqual([filters.rowKind, filters.stockKind, filters.status, filters.q], [null, null, null, ''])
})
