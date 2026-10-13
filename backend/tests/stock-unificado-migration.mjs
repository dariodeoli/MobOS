// Prueba de la migración 20270103000000_stock_unificado (U1) contra Postgres real.
//
// Crea una base descartable en el servidor indicado, aplica todas las migraciones
// ANTERIORES, siembra datos (incluido un historial de >5000 eventos de baja),
// aplica la migración nueva y comprueba:
//  - tipo de stock, baja real, vínculo de venta y de compra desde el backfill;
//  - removedAt == conjunto derivado de la auditoría completa (sin tope de 5000);
//  - volver a correr la migración completa cambia 0 filas y no pisa valores ya
//    puestos (cada backfill está protegido con IS NULL);
//  - la migración también aplica sobre una base vacía.
//
// Uso: STOCK_U1_PG_URL=postgresql://user@127.0.0.1:55891 node tests/stock-unificado-migration.mjs
// (URL del servidor SIN nombre de base; las bases temporales se borran al final.)
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const server = process.env.STOCK_U1_PG_URL
if (!server) {
  console.error('Falta STOCK_U1_PG_URL (servidor Postgres de prueba, sin base).')
  process.exit(2)
}
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')
const NEW = '20270103000000_stock_unificado'
const names = readdirSync(migrationsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
if (names[names.length - 1] !== NEW) throw new Error(`La migración ${NEW} debe ser la última (hay ${names[names.length - 1]}).`)
const sql = name => readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8')

const stamp = Date.now().toString(36)
const admin = new pg.Client({ connectionString: `${server}/postgres` })
const dbs = []
let checks = 0
const ok = (condition, label) => {
  if (!condition) throw new Error(`FALLÓ: ${label}`)
  checks += 1
  console.log(`ok · ${label}`)
}

async function scratch(label) {
  const name = `stock_u1_${label}_${stamp}`
  await admin.query(`CREATE DATABASE "${name}"`)
  dbs.push(name)
  const client = new pg.Client({ connectionString: `${server}/${name}` })
  await client.connect()
  return client
}

// Mismo criterio que lib/inventory.ts#removedInventoryUnitIds, sobre TODO el historial.
function removedFromAudit(events) {
  const resolved = new Set()
  const removed = new Set()
  for (const event of events) {
    if (resolved.has(event.entityId)) continue
    resolved.add(event.entityId)
    if (event.action === 'INVENTORY_UNIT_REMOVED') removed.add(event.entityId)
  }
  return removed
}

async function seed(db) {
  await db.query(`INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ('t1','T1','t1-${stamp}',now()),('t2','T2','t2-${stamp}',now())`)
  await db.query(`INSERT INTO "Branch" ("id","tenantId","name","updatedAt") VALUES ('b1','t1','B1',now()),('b2','t2','B2',now())`)
  await db.query(`INSERT INTO "User" ("id","tenantId","branchId","name","role","status","pinHash","updatedAt") VALUES ('u1','t1','b1','Admin','ADMIN','ACTIVE','x',now()),('u2','t2','b2','Admin2','ADMIN','ACTIVE','x',now())`)
  const productos = [
    ['p-cel', 't1', 'b1', 'Celulares'], ['p-tel', 't1', 'b1', 'Teléfonos'], ['p-acc', 't1', 'b1', 'Accesorios'],
    ['p-funda', 't1', 'b1', 'Fundas iPhone'], ['p-rep', 't1', 'b1', 'Repuestos'], ['p-pant', 't1', 'b1', 'Pantallas'],
    ['p-note', 't1', 'b1', 'Notebooks'], ['p-srv', 't1', 'b1', 'Servicio'], ['p-null', 't1', 'b1', null],
    ['p-farm', 't1', 'b1', 'Farmacia'], ['p-mac', 't1', 'b1', 'Mac'], ['p-acc-unit', 't1', 'b1', 'Accesorios'],
    ['p-t2', 't2', 'b2', 'Celulares'],
  ]
  for (const [id, tenant, branch, category] of productos) {
    await db.query(`INSERT INTO "Product" ("id","tenantId","branchId","sku","name","category","pricePyg","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,1000,now())`, [id, tenant, branch, `sku-${id}`, `Producto ${id}`, category])
  }
  // Unidades: una por producto «con IMEI» + las 6000 de la prueba de historial.
  const unidad = (id, tenant, product, branch, serial, status = 'AVAILABLE') => db.query(
    `INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::"InventoryUnitStatus",now())`, [id, tenant, product, branch, serial, status])
  await unidad('un-cel', 't1', 'p-cel', 'b1', 'IMEI-CEL')
  await unidad('un-acc', 't1', 'p-acc-unit', 'b1', 'IMEI-ACC')
  await unidad('un-sold', 't1', 'p-cel', 'b1', 'IMEI-SOLD', 'SOLD')
  await unidad('un-sold-open', 't1', 'p-cel', 'b1', 'IMEI-SOLD-OPEN', 'SOLD')
  await unidad('un-buy', 't1', 'p-cel', 'b1', 'IMEI-BUY')
  await unidad('un-nobuy', 't1', 'p-cel', 'b1', 'IMEI-NOBUY')
  await unidad('un-t2', 't2', 'p-t2', 'b2', 'IMEI-T2')
  await db.query(`
    INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","status","updatedAt")
    SELECT 'bulk-' || g, 't1', 'p-cel', 'b1', 'BULK-' || g, 'DEFECTIVE', now() FROM generate_series(0, 5999) g`)

  // 6000 bajas (la más vieja primero) y cada 3ª restaurada después: el tope de
  // 5000 del escaneo anterior habría perdido las bajas más antiguas.
  await db.query(`
    INSERT INTO "AuditLog" ("id","tenantId","userId","action","entity","entityId","metadata","createdAt")
    SELECT 'rm-' || g, 't1', 'u1', 'INVENTORY_UNIT_REMOVED', 'InventoryUnit', 'bulk-' || g, jsonb_build_object('reason', 'Baja ' || g), timestamp '2026-01-01' + g * interval '1 second' FROM generate_series(0, 5999) g`)
  await db.query(`
    INSERT INTO "AuditLog" ("id","tenantId","userId","action","entity","entityId","metadata","createdAt")
    SELECT 'rs-' || g, 't1', 'u1', 'INVENTORY_UNIT_RESTORED', 'InventoryUnit', 'bulk-' || g, '{}'::jsonb, timestamp '2026-06-01' + g * interval '1 second' FROM generate_series(0, 5999) g WHERE g % 3 = 0`)
  // Baja posterior a una restauración (vuelve a quedar eliminada) y restauración sin baja.
  await db.query(`
    INSERT INTO "AuditLog" ("id","tenantId","userId","action","entity","entityId","metadata","createdAt") VALUES
    ('rm-again','t1','u1','INVENTORY_UNIT_REMOVED','InventoryUnit','bulk-0','{"reason":"Otra vez"}'::jsonb, timestamp '2026-09-01'),
    ('rs-alone','t1','u1','INVENTORY_UNIT_RESTORED','InventoryUnit','un-cel','{}'::jsonb, timestamp '2026-09-02'),
    ('rm-other-tenant','t2','u2','INVENTORY_UNIT_REMOVED','InventoryUnit','un-t2','{"reason":"Otra empresa"}'::jsonb, timestamp '2026-09-03')`)

  // Ventas: la misma serie en dos pedidos (gana el más reciente) y una venta sin pedido.
  for (const [order, created] of [['o-old', '2026-02-01'], ['o-new', '2026-03-01']]) {
    await db.query(`INSERT INTO "Order" ("id","tenantId","branchId","sellerId","orderNumber","publicToken","status","subtotalPyg","totalPyg","createdAt","updatedAt") VALUES ($1,'t1','b1','u1',$2,$3,'COMPLETED',1000,1000,$4,now())`, [order, `N-${order}`, `tok-${order}`, created])
    await db.query(`INSERT INTO "OrderItem" ("id","orderId","description","quantity","unitPricePyg","totalPyg") VALUES ($1,$2,'Equipo',1,1000,1000)`, [`i-${order}`, order])
    await db.query(`INSERT INTO "OrderItemSerial" ("id","orderItemId","serial") VALUES ($1,$2,'IMEI-SOLD')`, [`s-${order}`, `i-${order}`])
  }
  // Compra de abastecimiento: una unidad con serial cargado, otra sin.
  await db.query(`INSERT INTO "SupplyPurchase" ("id","tenantId","code","supplierName","createdById","updatedAt") VALUES ('sp1','t1','COMP-1','Proveedor','u1',now())`)
  await db.query(`INSERT INTO "SupplyPurchaseLine" ("id","tenantId","purchaseId","productId","quantity") VALUES ('sl1','t1','sp1','p-cel',2)`)
  await db.query(`INSERT INTO "SupplyPurchaseSerial" ("id","tenantId","lineId","serial") VALUES ('ss1','t1','sl1','IMEI-BUY')`)
}

async function snapshot(db) {
  const units = await db.query(`SELECT "id","removedAt","removedById","removedReason","soldOrderItemId","soldAt","purchaseLineId" FROM "InventoryUnit" ORDER BY "id"`)
  const products = await db.query(`SELECT "id","stockKind" FROM "Product" ORDER BY "id"`)
  return JSON.stringify({ units: units.rows, products: products.rows })
}

try {
  await admin.connect()

  // ── Base vacía: toda la cadena aplica ──
  const vacia = await scratch('empty')
  for (const name of names) await vacia.query(sql(name))
  const cols = await vacia.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'InventoryUnit' AND column_name IN ('removedAt','removedById','removedReason','soldOrderItemId','soldAt','purchaseLineId')`)
  ok(cols.rowCount === 6, 'base vacía: la cadena completa aplica y crea los 6 campos de InventoryUnit')
  const kindCol = await vacia.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'stockKind' AND is_nullable = 'YES'`)
  ok(kindCol.rowCount === 1, 'base vacía: Product.stockKind existe y es opcional')
  await vacia.query(sql(NEW))
  ok(true, 'base vacía: re-aplicar la migración no falla (idempotente)')
  await vacia.end()

  // ── Base en la migración anterior, con datos ──
  const previa = await scratch('prev')
  for (const name of names.filter(item => item !== NEW)) await previa.query(sql(name))
  await seed(previa)
  const eventos = (await previa.query(`SELECT "entityId","action" FROM "AuditLog" WHERE "entity" = 'InventoryUnit' AND "action" IN ('INVENTORY_UNIT_REMOVED','INVENTORY_UNIT_RESTORED') ORDER BY "createdAt" DESC, "id" DESC`)).rows
  ok(eventos.length > 5000, `fixture: ${eventos.length} eventos de baja/restauración (> 5000)`)
  const esperadas = removedFromAudit(eventos)

  await previa.query(sql(NEW))
  const removidas = new Set((await previa.query(`SELECT "id" FROM "InventoryUnit" WHERE "removedAt" IS NOT NULL`)).rows.map(row => row.id))
  ok(removidas.size === esperadas.size && [...esperadas].every(id => removidas.has(id)), `removedAt == conjunto derivado de la auditoría completa (${removidas.size} unidades)`)
  const viejas = [...esperadas].filter(id => id.startsWith('bulk-') && Number(id.slice(5)) < 500)
  ok(viejas.length > 0 && viejas.every(id => removidas.has(id)), 'las bajas más antiguas (fuera de los últimos 5000 eventos) quedan marcadas')
  const detalle = (await previa.query(`SELECT "removedById","removedReason" FROM "InventoryUnit" WHERE "id" = 'bulk-1'`)).rows[0]
  ok(detalle.removedById === 'u1' && detalle.removedReason === 'Baja 1', 'removedById y removedReason salen del evento de baja')
  ok((await previa.query(`SELECT "removedAt" FROM "InventoryUnit" WHERE "id" = 'bulk-3'`)).rows[0].removedAt === null, 'una unidad restaurada queda sin removedAt')
  ok((await previa.query(`SELECT "removedAt" FROM "InventoryUnit" WHERE "id" = 'bulk-0'`)).rows[0].removedAt !== null, 'baja posterior a la restauración vuelve a quedar eliminada')
  ok((await previa.query(`SELECT "removedAt" FROM "InventoryUnit" WHERE "id" = 'un-cel'`)).rows[0].removedAt === null, 'restauración sin baja previa no marca nada')
  ok((await previa.query(`SELECT "removedAt" FROM "InventoryUnit" WHERE "id" = 'un-t2'`)).rows[0].removedAt !== null, 'la baja de otra empresa se aplica solo a su unidad (por tenant)')

  const kinds = Object.fromEntries((await previa.query(`SELECT "id","stockKind" FROM "Product"`)).rows.map(row => [row.id, row.stockKind]))
  const esperadoKinds = { 'p-cel': 'EQUIPO', 'p-tel': 'EQUIPO', 'p-acc': 'ACCESORIO', 'p-funda': 'ACCESORIO', 'p-rep': 'REPUESTO', 'p-pant': 'REPUESTO', 'p-note': 'EQUIPO', 'p-srv': 'OTRO', 'p-null': 'OTRO', 'p-farm': 'OTRO', 'p-mac': 'EQUIPO', 'p-acc-unit': 'EQUIPO', 'p-t2': 'EQUIPO' }
  ok(Object.entries(esperadoKinds).every(([id, kind]) => kinds[id] === kind), `stockKind por unidades/categoría: ${JSON.stringify(kinds)}`)
  ok(!Object.values(kinds).includes(null), 'ningún producto queda con stockKind NULL tras el backfill')

  const venta = (await previa.query(`SELECT "soldOrderItemId","soldAt" FROM "InventoryUnit" WHERE "id" = 'un-sold'`)).rows[0]
  ok(venta.soldOrderItemId === 'i-o-new' && venta.soldAt.toISOString().startsWith('2026-03-01'), 'unidad SOLD enlaza a la venta más reciente de su serial')
  const abierta = (await previa.query(`SELECT "soldOrderItemId" FROM "InventoryUnit" WHERE "id" = 'un-sold-open'`)).rows[0]
  ok(abierta.soldOrderItemId === null, 'SOLD sin pedido registrado queda sin vínculo (no se inventa)')
  ok((await previa.query(`SELECT count(*)::int AS n FROM "InventoryUnit" WHERE "status" <> 'SOLD' AND "soldOrderItemId" IS NOT NULL`)).rows[0].n === 0, 'solo las SOLD reciben vínculo de venta')

  const compra = (await previa.query(`SELECT "id","purchaseLineId" FROM "InventoryUnit" WHERE "id" IN ('un-buy','un-nobuy') ORDER BY "id"`)).rows
  ok(compra[0].purchaseLineId === 'sl1' && compra[1].purchaseLineId === null, 'purchaseLineId solo donde SupplyPurchaseSerial lo respalda')

  // ── Segunda pasada: 0 filas cambian y los valores puestos a mano se respetan ──
  await previa.query(`UPDATE "Product" SET "stockKind" = 'ACCESORIO' WHERE "id" = 'p-cel'`)
  const antes = await snapshot(previa)
  await previa.query(sql(NEW))
  const despues = await snapshot(previa)
  ok(antes === despues, 'segunda pasada de la migración: 0 filas cambian (y stockKind manual no se pisa)')
  await previa.end()

  console.log(`stock-unificado-migration: OK (${checks} comprobaciones)`)
} catch (error) {
  console.error(error?.message || error)
  process.exitCode = 1
} finally {
  for (const name of dbs) {
    try { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`) } catch (error) { console.error(`No se pudo borrar ${name}: ${error?.message || error}`) }
  }
  await admin.end()
}
