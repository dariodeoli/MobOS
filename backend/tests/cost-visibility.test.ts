import assert from 'node:assert/strict'
import test from 'node:test'
import { canSeeCost, sellerSeesCostsFrom, dropCostColumns, redactAuditMetadata, redactOrderItemCosts, redactProductCosts, redactUnitCosts } from '../lib/cost-visibility'

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

test('redactUnitCosts: oculta costo, moneda, proveedor y consignación; ADMIN/GERENTE reciben el original', () => {
  const unidad = { serial: 'IMEI', costPyg: 10, originalCost: 5, exchangeRatePyg: 7000, consignorPyg: 3, consignorName: 'Ana', consignorPhone: '0981', costCurrency: 'USD', supplierId: 's', supplierName: 'P', supplier: { id: 's' }, inspection: { grado: 'A', costoRepuestosPyg: 80000 } }
  for (const role of ['ADMIN', 'GERENTE']) assert.equal(redactUnitCosts(unidad, canSeeCost(role, OFF)), unidad)
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const out = redactUnitCosts(unidad, canSeeCost(role, OFF)) as Record<string, any>
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
  assert.equal(redactAuditMetadata(metadata, true), metadata)
  assert.deepEqual(redactAuditMetadata(metadata, false), { stock: 3, costPyg: null, before: { costPyg: null, price: 5 }, lines: [{ unitCostPyg: null, sku: 'A' }], supplierName: null, finalTotalCostPyg: null })
  assert.equal(redactAuditMetadata(null, false), null)
})

test('dropCostColumns (exportación de unidades): quita Proveedor y Costo salvo ADMIN/GERENTE', () => {
  const headers = ['Producto', 'Serial', 'Proveedor', 'Costo (Gs)']
  const rows = [['iPhone', 'IMEI1', 'Prov', 4200000]]
  for (const role of ['ADMIN', 'GERENTE']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role, OFF)), { headers, rows })
  for (const role of ['VENDEDOR', 'CAJERA']) assert.deepEqual(dropCostColumns(headers, rows, ['Proveedor', 'Costo (Gs)'], canSeeCost(role, OFF)), { headers: ['Producto', 'Serial'], rows: [['iPhone', 'IMEI1']] })
})
