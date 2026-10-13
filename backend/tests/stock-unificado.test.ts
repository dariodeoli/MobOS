import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyStockKind } from '../lib/stock-kind'
import { removalFields, restoreFields, removedInventoryUnitIds } from '../lib/inventory'
import { linkSoldUnits, recomputeStock, UNLINK_SOLD } from '../lib/stock'

// U1 · Stock unificado: clasificador de tipo, baja real, vínculo de venta y
// recomputo del contador. El backfill SQL de la migración se prueba contra
// Postgres en tests/stock-unificado-migration.mjs con las mismas categorías.

test('stock-kind: unidades con IMEI fuerzan EQUIPO; la categoría decide el resto', () => {
  assert.equal(classifyStockKind({ category: 'Accesorios', hasUnits: true }), 'EQUIPO')
  assert.equal(classifyStockKind({ category: 'Celulares' }), 'EQUIPO')
  assert.equal(classifyStockKind({ category: 'Teléfonos' }), 'EQUIPO')
  assert.equal(classifyStockKind({ category: 'Notebooks' }), 'EQUIPO')
  assert.equal(classifyStockKind({ category: 'Mac' }), 'EQUIPO')
  assert.equal(classifyStockKind({ category: 'Accesorios' }), 'ACCESORIO')
  assert.equal(classifyStockKind({ category: 'Fundas iPhone' }), 'ACCESORIO', 'la funda manda aunque nombre un equipo')
  assert.equal(classifyStockKind({ category: 'Repuestos' }), 'REPUESTO')
  assert.equal(classifyStockKind({ category: 'Pantallas' }), 'REPUESTO')
  assert.equal(classifyStockKind({ category: 'Servicio' }), 'OTRO')
  assert.equal(classifyStockKind({ category: 'Farmacia' }), 'OTRO', '«mac» solo cuenta como palabra entera')
  assert.equal(classifyStockKind({ category: null }), 'OTRO')
  assert.equal(classifyStockKind(), 'OTRO')
})

test('baja real: remove escribe los tres campos y restore los limpia', () => {
  const at = new Date('2026-10-01T10:00:00Z')
  assert.deepEqual(removalFields('user-1', 'Roto', at), { removedAt: at, removedById: 'user-1', removedReason: 'Roto' })
  assert.deepEqual(restoreFields(), { removedAt: null, removedById: null, removedReason: null })
  // El conjunto derivado de la auditoría sigue disponible para el chequeo de consistencia.
  const eventos = [{ entityId: 'u1', action: 'INVENTORY_UNIT_RESTORED' }, { entityId: 'u1', action: 'INVENTORY_UNIT_REMOVED' }, { entityId: 'u2', action: 'INVENTORY_UNIT_REMOVED' }]
  assert.deepEqual([...removedInventoryUnitIds(eventos)], ['u2'])
})

test('recomputeStock cuenta solo unidades AVAILABLE/RESERVED no dadas de baja', async () => {
  const calls: any = {}
  const tx: any = {
    inventoryUnit: { count: async (args: any) => { calls.count = args; return 3 } },
    product: { updateMany: async (args: any) => { calls.update = args; return { count: 1 } } },
  }
  assert.equal(await recomputeStock(tx, 'tenant-1', 'prod-1'), 3)
  assert.equal(calls.count.where.tenantId, 'tenant-1')
  assert.equal(calls.count.where.productId, 'prod-1')
  assert.equal(calls.count.where.removedAt, null, 'las bajas no suman al stock')
  assert.deepEqual(calls.count.where.status, { in: ['AVAILABLE', 'RESERVED'] })
  assert.deepEqual(calls.update, { where: { id: 'prod-1', tenantId: 'tenant-1' }, data: { stock: 3 } })
})

test('venta: linkSoldUnits enlaza la línea y la fecha, acotado por empresa y SOLD', async () => {
  const llamadas: any[] = []
  const tx: any = { inventoryUnit: { updateMany: async (args: any) => { llamadas.push(args); return { count: args.where.serial.in.length } } } }
  const when = new Date('2026-10-02T12:00:00Z')
  const linked = await linkSoldUnits(tx, 'tenant-1', [
    { id: 'item-1', serials: ['A', ' ', 'B'] },
    { id: 'item-2', serials: [] },
    { id: 'item-3', serials: 'no-es-lista' },
  ], when)
  assert.equal(linked, 2 + 0)
  assert.equal(llamadas.length, 1, 'las líneas sin seriales no consultan la base')
  assert.deepEqual(llamadas[0], { where: { tenantId: 'tenant-1', serial: { in: ['A', 'B'] }, status: 'SOLD' }, data: { soldOrderItemId: 'item-1', soldAt: when } })
})

test('anulación/devolución: UNLINK_SOLD limpia el vínculo de venta', () => {
  assert.deepEqual({ ...UNLINK_SOLD }, { soldOrderItemId: null, soldAt: null })
})
