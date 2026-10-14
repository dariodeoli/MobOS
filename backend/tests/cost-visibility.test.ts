import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSupplierDirectory, canSeeCost, canSeeSupplierName, redactSupplierNames, scrubSupplierNames, supplierBadge, supplierCodeFor, sellerSeesCostsFrom, dropCostColumns, redactAuditMetadata, redactOrderCosts, redactOrderItemCosts, redactProductCosts, redactUnitCosts } from '../lib/cost-visibility'

// Una sola regla de visibilidad de costos para todas las rutas.

const OFF = { permissions: { sellerSeesCosts: false } }
const ON = { permissions: { sellerSeesCosts: true } }

test('canSeeCost con el permiso de vendedores apagado: solo ADMIN y GERENTE', () => {
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(canSeeCost(role, OFF), true, role)
  for (const role of ['VENDEDOR', 'CAJERA', 'REPARTIDOR', 'TECNICO', '', null, undefined]) assert.equal(canSeeCost(role as string, OFF), false, String(role))
})

test('canSeeCost: por defecto (sin ajuste) y encendido, vendedores y caja ven costos', () => {
  for (const settings of [undefined, null, {}, [], 'x', { permissions: {} }, { permissions: [] }, ON]) {
    for (const role of ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA']) assert.equal(canSeeCost(role, settings), true, `${role} ${JSON.stringify(settings)}`)
    for (const role of ['REPARTIDOR', 'TECNICO', '', null, undefined]) assert.equal(canSeeCost(role as string, settings), false, String(role))
  }
  assert.equal(sellerSeesCostsFrom(undefined), true)
  assert.equal(sellerSeesCostsFrom(OFF), false)
})

test('redactUnitCosts: oculta costo y consignación; el proveedor queda como sigla; ADMIN/GERENTE reciben el original', () => {
  const unidad = { serial: 'IMEI', costPyg: 10, originalCost: 5, exchangeRatePyg: 7000, consignorPyg: 3, consignorName: 'Ana', consignorPhone: '0981', costCurrency: 'USD', supplierId: 's', supplierName: 'Mayorista Real', supplier: { id: 's', name: 'Mayorista Real', code: 'MR' }, inspection: { grado: 'A', costoRepuestosPyg: 80000 } }
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(redactUnitCosts(unidad, canSeeCost(role, OFF), canSeeSupplierName(role)), unidad)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactUnitCosts(unidad, canSeeCost(role, OFF), canSeeSupplierName(role)) as Record<string, any>
    for (const field of ['costPyg', 'originalCost', 'exchangeRatePyg', 'consignorPyg', 'consignorName', 'consignorPhone', 'costCurrency']) assert.equal(out[field], null, field)
    assert.equal(out.supplierId, 's', 'el id es opaco y se conserva')
    assert.deepEqual(out.supplier, { id: 's', code: 'MR' })
    assert.equal(out.supplierName, 'MR')
    assert.equal(JSON.stringify(out).includes('Mayorista Real'), false)
    assert.equal(out.inspection.costoRepuestosPyg, null)
    assert.equal(out.inspection.grado, 'A')
    assert.equal(out.serial, 'IMEI')
  }
  assert.equal(unidad.costPyg, 10, 'no muta el original')
})

test('canSeeSupplierName: solo ADMIN y GERENTE, aunque los vendedores vean costos', () => {
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(canSeeSupplierName(role), true, role)
  for (const role of ['VENDEDOR', 'CAJERA', 'REPARTIDOR', 'TECNICO', '', null, undefined]) assert.equal(canSeeSupplierName(role as string), false, String(role))
  // Independiente del ajuste: con costos visibles para vendedores el nombre sigue oculto.
  assert.equal(canSeeCost('VENDEDOR', ON), true)
  assert.equal(canSeeSupplierName('VENDEDOR'), false)
})

test('supplierBadge: sigla del proveedor; «S/S» sin sigla y nunca iniciales del nombre', () => {
  assert.deepEqual(supplierBadge({ id: 's1', code: ' MR ', name: 'Mayorista Real' } as never), { id: 's1', code: 'MR' })
  assert.deepEqual(supplierBadge({ id: 's2', code: null }), { id: 's2', code: 'S/S' })
  assert.deepEqual(supplierBadge({ id: 's3', code: '  ' }), { id: 's3', code: 'S/S' })
  assert.deepEqual(supplierBadge(null), { id: null, code: 'S/S' })
  assert.deepEqual(supplierBadge({ id: 's4', code: 'AB', icon: 'star', color: '#123456' }), { id: 's4', code: 'AB', icon: 'star', color: '#123456' })
})

test('redactUnitCosts: unidad sin relación de proveedor muestra «S/S» y no el texto libre', () => {
  const out = redactUnitCosts({ supplierId: null, supplierName: 'Juan el del mercado' }, true, false) as Record<string, any>
  assert.equal(out.supplierName, 'S/S')
  assert.equal(JSON.stringify(out).includes('Juan'), false)
})

test('scrubSupplierNames / redactSupplierNames: el nombre real en cualquier texto pasa a sigla', () => {
  const dir = buildSupplierDirectory([{ id: 's1', name: 'Mayorista Real', code: 'MR' }, { id: 's2', name: 'Casa Sin Sigla', code: null }])
  const out = scrubSupplierNames({ a: 'Pago a mayorista real (lote 1)', b: ['Casa Sin Sigla', 'Mayorista Reales'], n: 5 }, dir)
  assert.deepEqual(out, { a: 'Pago a MR (lote 1)', b: ['S/S', 'Mayorista Reales'], n: 5 })
  assert.equal(supplierCodeFor(dir, 's1'), 'MR')
  assert.equal(supplierCodeFor(dir, 'nope'), 'S/S')
  const rel = redactSupplierNames({ parts: [{ supplier: { id: 's1', name: 'Mayorista Real', code: 'MR' }, notes: 'de Mayorista Real' }] }, dir) as any
  assert.deepEqual(rel.parts[0], { supplier: { id: 's1', code: 'MR' }, notes: 'de MR' })
})

test('redactProductCosts (GET /api/products y /api/stock): costPyg nulo para vendedor y cajera', () => {
  const producto = { id: 'p', name: 'Cargador', pricePyg: 100, costPyg: 40, unitsCount: 2 }
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(redactProductCosts(producto, canSeeCost(role, OFF)).costPyg, 40)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactProductCosts(producto, canSeeCost(role, OFF))
    assert.equal(out.costPyg, null)
    assert.equal(out.pricePyg, 100)
    assert.equal(out.unitsCount, 2)
  }
  assert.equal(producto.costPyg, 40)
})

test('redactOrderItemCosts (GET /api/orders): sin costo unitario para vendedor y cajera', () => {
  const item = { description: 'iPhone', unitPricePyg: 5000000, unitCostPyg: 4000000, baseUnitCostPyg: 3900000, quantity: 1 }
  for (const role of ['ADMIN', 'GERENTE']) assert.deepEqual(redactOrderItemCosts(item, canSeeCost(role, OFF)), item)
  for (const role of ['VENDEDOR', 'CAJERA']) assert.deepEqual(redactOrderItemCosts(item, canSeeCost(role, OFF)), { ...item, unitCostPyg: null, baseUnitCostPyg: null })
})

test('redactAuditMetadata (historial del producto): costo y proveedor anidados quedan nulos', () => {
  const metadata = { stock: 3, costPyg: 100, before: { costPyg: 90, price: 5 }, lines: [{ unitCostPyg: 7, sku: 'A' }], supplierName: 'P', finalTotalCostPyg: 9 }
  assert.equal(redactAuditMetadata(metadata, true, true), metadata)
  assert.deepEqual(redactAuditMetadata(metadata, false, false), { stock: 3, costPyg: null, before: { costPyg: null, price: 5 }, lines: [{ unitCostPyg: null, sku: 'A' }], supplierName: null, finalTotalCostPyg: null })
  assert.equal(redactAuditMetadata(null, false, false), null)
  // Vendedor con costos visibles: el costo sale, el proveedor no.
  assert.deepEqual(redactAuditMetadata({ costPyg: 100, supplierName: 'P', proveedor: 'Q', sku: 'A' }, true, false), { costPyg: 100, supplierName: null, proveedor: null, sku: 'A' })
})

test('dropCostColumns (exportación de unidades): quita Proveedor y Costo salvo ADMIN/GERENTE', () => {
  const headers = ['Producto', 'Serial', 'Proveedor', 'Costo (Gs)']
  const rows = [['iPhone', 'IMEI1', 'Prov', 4200000]]
  for (const role of ['ADMIN', 'GERENTE']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role, OFF)), { headers, rows })
  for (const role of ['VENDEDOR', 'CAJERA']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role, OFF)), { headers: ['Producto', 'Serial'], rows: [['iPhone', 'IMEI1']] })
})

test('redactOrderCosts: oculta costo en líneas y en la copia congelada del comprobante', () => {
  const pedido = { id: 'o1', items: [{ id: 'i1', unitCostPyg: 10, baseUnitCostPyg: 9, totalPyg: 50 }], receiptSnapshot: { version: 1, datos: { items: [{ unitCostPyg: 10, totalPyg: 50 }] } } }
  assert.equal(redactOrderCosts(pedido, canSeeCost('ADMIN')), pedido)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactOrderCosts(pedido, canSeeCost(role, { permissions: { sellerSeesCosts: false } })) as Record<string, any>
    assert.equal(out.items[0].unitCostPyg, null)
    assert.equal(out.items[0].baseUnitCostPyg, null)
    assert.equal(out.items[0].totalPyg, 50)
    assert.equal(out.receiptSnapshot.datos.items[0].unitCostPyg, null)
  }
  assert.equal(pedido.items[0].unitCostPyg, 10)
})
