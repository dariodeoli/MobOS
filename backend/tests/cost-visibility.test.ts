import assert from 'node:assert/strict'
import test from 'node:test'
import { canSeeCost, dropCostColumns, redactAuditMetadata, redactOrderCosts, redactOrderItemCosts, redactProductCosts, redactUnitCosts } from '../lib/cost-visibility'

// Una sola regla de visibilidad de costos para todas las rutas.

test('canSeeCost: solo ADMIN y GERENTE', () => {
  assert.equal(canSeeCost('ADMIN'), true)
  assert.equal(canSeeCost('GERENTE'), true)
  for (const role of ['VENDEDOR', 'CAJERA', 'REPARTIDOR', 'TECNICO', '', null, undefined]) assert.equal(canSeeCost(role as string), false, String(role))
})

test('redactUnitCosts: oculta costo, moneda, proveedor y consignación; ADMIN/GERENTE reciben el original', () => {
  const unidad = { serial: 'IMEI', costPyg: 10, originalCost: 5, exchangeRatePyg: 7000, consignorPyg: 3, consignorName: 'Ana', consignorPhone: '0981', costCurrency: 'USD', supplierId: 's', supplierName: 'P', supplier: { id: 's' }, inspection: { grado: 'A', costoRepuestosPyg: 80000 } }
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(redactUnitCosts(unidad, canSeeCost(role)), unidad)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactUnitCosts(unidad, canSeeCost(role)) as Record<string, any>
    for (const field of ['costPyg', 'originalCost', 'exchangeRatePyg', 'consignorPyg', 'consignorName', 'consignorPhone', 'costCurrency', 'supplierId', 'supplierName']) assert.equal(out[field], null, field)
    assert.equal('supplier' in out, false)
    assert.equal(out.inspection.costoRepuestosPyg, null)
    assert.equal(out.inspection.grado, 'A')
    assert.equal(out.serial, 'IMEI')
  }
  assert.equal(unidad.costPyg, 10, 'no muta el original')
})

test('redactProductCosts (GET /api/products y /api/stock): costPyg nulo para vendedor y cajera', () => {
  const producto = { id: 'p', name: 'Cargador', pricePyg: 100, costPyg: 40, unitsCount: 2 }
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(redactProductCosts(producto, canSeeCost(role)).costPyg, 40)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactProductCosts(producto, canSeeCost(role))
    assert.equal(out.costPyg, null)
    assert.equal(out.pricePyg, 100)
    assert.equal(out.unitsCount, 2)
  }
  assert.equal(producto.costPyg, 40)
})

test('redactOrderItemCosts (GET /api/orders): sin costo unitario para vendedor y cajera', () => {
  const item = { description: 'iPhone', unitPricePyg: 5000000, unitCostPyg: 4000000, baseUnitCostPyg: 3900000, quantity: 1 }
  for (const role of ['ADMIN', 'GERENTE']) assert.deepEqual(redactOrderItemCosts(item, canSeeCost(role)), item)
  for (const role of ['VENDEDOR', 'CAJERA']) assert.deepEqual(redactOrderItemCosts(item, canSeeCost(role)), { ...item, unitCostPyg: null, baseUnitCostPyg: null })
})

test('redactAuditMetadata (historial del producto): costo y proveedor anidados quedan nulos', () => {
  const metadata = { stock: 3, costPyg: 100, before: { costPyg: 90, price: 5 }, lines: [{ unitCostPyg: 7, sku: 'A' }], supplierName: 'P', finalTotalCostPyg: 9 }
  assert.equal(redactAuditMetadata(metadata, true), metadata)
  assert.deepEqual(redactAuditMetadata(metadata, false), { stock: 3, costPyg: null, before: { costPyg: null, price: 5 }, lines: [{ unitCostPyg: null, sku: 'A' }], supplierName: null, finalTotalCostPyg: null })
  assert.equal(redactAuditMetadata(null, false), null)
})

test('dropCostColumns (exportación de unidades): quita Proveedor y Costo salvo ADMIN/GERENTE', () => {
  const headers = ['Producto', 'Serial', 'Proveedor', 'Costo (Gs)']
  const rows = [['iPhone', 'IMEI1', 'Prov', 4200000]]
  for (const role of ['ADMIN', 'GERENTE']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role)), { headers, rows })
  for (const role of ['VENDEDOR', 'CAJERA']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role)), { headers: ['Producto', 'Serial'], rows: [['iPhone', 'IMEI1']] })
})

test('redactOrderCosts: oculta costo en líneas y en la copia congelada del comprobante', () => {
  const pedido = { id: 'o1', items: [{ id: 'i1', unitCostPyg: 10, baseUnitCostPyg: 9, totalPyg: 50 }], receiptSnapshot: { version: 1, datos: { items: [{ unitCostPyg: 10, totalPyg: 50 }] } } }
  assert.equal(redactOrderCosts(pedido, canSeeCost('ADMIN')), pedido)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactOrderCosts(pedido, canSeeCost(role)) as Record<string, any>
    assert.equal(out.items[0].unitCostPyg, null)
    assert.equal(out.items[0].baseUnitCostPyg, null)
    assert.equal(out.items[0].totalPyg, 50)
    assert.equal(out.receiptSnapshot.datos.items[0].unitCostPyg, null)
  }
  assert.equal(pedido.items[0].unitCostPyg, 10)
})
