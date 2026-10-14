// Funciones de lib que otras rutas (llegadas, #400/#408) llaman dentro de su
// propia transacción: crearTraslado y attachSerialsToOrderItem. Se ejecutan
// directo contra la base del arnés de integración (sin pasar por HTTP).
//
// Uso: DATABASE_URL=... node tests/lib-traslado-seriales.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)

const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { crearTraslado } = require('../lib/transfers.ts')
const { attachSerialsToOrderItem } = require('../lib/order-serials.ts')

if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(2) }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const tenantId = 'tenant-a-it'; const userId = 'user-admin-it'
const branchA = 'branch-a-it'; const branchA2 = 'branch-a2-it'
const run = Date.now().toString(36)

async function rejects(promise, pattern) {
  let failure = null
  try { await promise } catch (cause) { failure = cause }
  assert.ok(failure, 'Debía fallar.')
  assert.match(failure.message, pattern)
  return failure
}

async function main() {
  // ── crearTraslado ──
  const serialA = `LIBTR-${run}-1`; const serialB = `LIBTR-${run}-2`
  const source = await prisma.product.create({ data: { tenantId, branchId: branchA, sku: `LIBTR-${run}`, name: 'Equipo lib traslado', pricePyg: 1000000n, costPyg: 700000n, stock: 2, stockKind: 'EQUIPO' } })
  const unitA = await prisma.inventoryUnit.create({ data: { tenantId, productId: source.id, branchId: branchA, serial: serialA, status: 'AVAILABLE' } })
  await prisma.inventoryUnit.create({ data: { tenantId, productId: source.id, branchId: branchA, serial: serialB, status: 'AVAILABLE' } })

  // Falla a mitad: la transacción del llamador revierte todo.
  await rejects(prisma.$transaction(tx => crearTraslado(tx, { tenantId, fromBranchId: branchA, toBranchId: branchA, userId, items: [{ productId: source.id, quantity: 1, serials: [serialA] }] })), /Sucursal de origen o destino no encontrada/)
  await rejects(prisma.$transaction(tx => crearTraslado(tx, { tenantId, fromBranchId: branchA, toBranchId: branchA2, userId, items: [{ productId: source.id, quantity: 1, serials: ['NO-EXISTE'] }] })), /IMEI\/serial no está disponible/)
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: source.id } })).stock, 2, 'Una falla no deja stock descontado.')
  assert.equal(await prisma.stockTransfer.count({ where: { tenantId, sourceBranchId: branchA, lines: { some: { sourceProductId: source.id } } } }), 0)

  // Por unitIds, con clave de idempotencia: la segunda confirmación devuelve el mismo traslado.
  const key = `libtr-${run}`
  const input = { tenantId, fromBranchId: branchA, toBranchId: branchA2, userId, unitIds: [unitA.id], note: 'desde lib', idempotencyKey: key }
  const transfer = await prisma.$transaction(tx => crearTraslado(tx, input))
  assert.equal(transfer.lines.length, 1)
  assert.deepEqual(transfer.lines[0].serials, [serialA])
  assert.equal(transfer.dispatchedById, userId)
  assert.equal((await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unitA.id } })).status, 'IN_TRANSIT')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: source.id } })).stock, 1)
  const again = await prisma.$transaction(tx => crearTraslado(tx, input))
  assert.equal(again.id, transfer.id, 'Misma clave, mismo traslado.')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: source.id } })).stock, 1, 'La repetición no descuenta de nuevo.')
  assert.equal(await prisma.auditLog.count({ where: { tenantId, action: 'STOCK_TRANSFERRED', entityId: transfer.id } }), 1)

  // Por items: otra unidad; tenant ajeno no ve las sucursales.
  const porItems = await prisma.$transaction(tx => crearTraslado(tx, { tenantId, fromBranchId: branchA, toBranchId: branchA2, userId, items: [{ productId: source.id, quantity: 1, serials: [serialB] }] }))
  assert.equal(porItems.lines[0].quantity, 1)
  await rejects(prisma.$transaction(tx => crearTraslado(tx, { tenantId: 'tenant-b-it', fromBranchId: branchA, toBranchId: branchA2, userId, items: [{ productId: source.id, quantity: 1, serials: [] }] })), /Sucursal de origen o destino no encontrada/)

  // ── attachSerialsToOrderItem ──
  const product = await prisma.product.create({ data: { tenantId, branchId: branchA, sku: `LIBSER-${run}`, name: 'Equipo lib seriales', pricePyg: 2000000n, stock: 1, stockKind: 'EQUIPO' } })
  const supplier = await prisma.supplier.create({ data: { tenantId, name: `Proveedor lib ${run}` } })
  const order = await prisma.order.create({ data: { tenantId, branchId: branchA, sellerId: userId, orderNumber: `LIB-${run}`, subtotalPyg: 6000000n, totalPyg: 6000000n, items: { create: [
    { description: 'Sobre pedido', productId: product.id, quantity: 3, unitPricePyg: 2000000n, totalPyg: 6000000n, serialsPending: 3, costPending: true },
  ] } }, include: { items: true } })
  const itemId = order.items[0].id
  const base = { tenantId, orderId: order.id, orderItemId: itemId, userId }

  // Unidad que no existía: se crea SOLD con costo y proveedor, sin tocar el stock.
  const nuevo = `LIBSER-${run}-NEW`
  await prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base, serials: [nuevo], condition: 'USED', costPyg: 1500000, supplierId: supplier.id }))
  const unit = await prisma.inventoryUnit.findFirstOrThrow({ where: { tenantId, serial: nuevo } })
  assert.equal(unit.status, 'SOLD'); assert.equal(unit.condition, 'USED'); assert.equal(unit.costPyg, 1500000n); assert.equal(unit.supplierId, supplier.id)
  assert.equal(unit.branchId, branchA); assert.ok(unit.soldOrderItemId === itemId, 'La unidad queda vinculada a la línea.')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 1, 'Crear la unidad vendida no mueve el stock.')
  let item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } })
  assert.equal(item.costPending, false); assert.equal(item.unitCostPyg, 1500000n); assert.equal(item.baseUnitCostPyg, 1500000n)
  assert.equal(item.serialsPending, 2); assert.deepEqual(item.serials, [nuevo])
  assert.equal(await prisma.orderItemSerial.count({ where: { orderItemId: itemId, serial: nuevo } }), 1)

  // Sin opcionales: comportamiento de siempre (NEW, sin costo ni proveedor).
  const simple = `LIBSER-${run}-SIMPLE`
  await prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base, serials: [simple] }))
  const plain = await prisma.inventoryUnit.findFirstOrThrow({ where: { tenantId, serial: simple } })
  assert.equal(plain.status, 'SOLD'); assert.equal(plain.condition, 'NEW'); assert.equal(plain.costPyg, null); assert.equal(plain.supplierId, null)

  // Unidad ya en stock: pasa a SOLD y descuenta una sola vez.
  const enStock = `LIBSER-${run}-STOCK`
  await prisma.inventoryUnit.create({ data: { tenantId, productId: product.id, branchId: branchA, serial: enStock, status: 'AVAILABLE' } })
  await prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base, serials: [enStock] }))
  assert.equal((await prisma.inventoryUnit.findFirstOrThrow({ where: { tenantId, serial: enStock } })).status, 'SOLD')
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 0, 'Descuenta una sola vez.')

  // Errores: línea agotada, serial repetido, proveedor ajeno, pedido de otra empresa.
  await rejects(prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base, serials: ['X-1'] })), /solo espera 0/)
  const order2 = await prisma.order.create({ data: { tenantId, branchId: branchA, sellerId: userId, orderNumber: `LIB2-${run}`, subtotalPyg: 1n, totalPyg: 1n, items: { create: [{ description: 'Otro', productId: product.id, quantity: 1, unitPricePyg: 1n, totalPyg: 1n, serialsPending: 1 }] } }, include: { items: true } })
  const base2 = { tenantId, orderId: order2.id, orderItemId: order2.items[0].id, userId }
  await rejects(prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base2, serials: ['X-2'], supplierId: 'no-existe' })), /Proveedor no encontrado/)
  await rejects(prisma.$transaction(tx => attachSerialsToOrderItem(tx, { ...base2, tenantId: 'tenant-b-it', serials: ['X-2'] })), /Pedido no encontrado/)
  assert.equal(await prisma.inventoryUnit.count({ where: { tenantId, serial: 'X-2' } }), 0)
  console.log('lib traslado/seriales: ok')
}

main().then(() => prisma.$disconnect()).catch(async cause => { console.error(cause); await prisma.$disconnect(); process.exit(1) })
