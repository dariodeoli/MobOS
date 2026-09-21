// Rendimiento con volumen (#177): siembra datos sintéticos y mide con EXPLAIN
// ANALYZE las consultas que usan el POS, los listados de pedidos, la búsqueda
// (q) y el kardex. Uso:
//   DATABASE_URL=postgresql://… node tests/perf-volume.mjs --seed
//   DATABASE_URL=postgresql://… node tests/perf-volume.mjs
// El tenant de prueba es "perf-tenant" y no toca datos de otras empresas.
import { execFileSync } from 'node:child_process'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL.')
const PG_BIN = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const TENANT = 'perf-tenant'
const PRODUCTOS = Number(process.env.PERF_PRODUCTOS || 4000)
const UNIDADES = Number(process.env.PERF_UNIDADES || 3000)
const PEDIDOS = Number(process.env.PERF_PEDIDOS || 2000)

const psql = (sql) => execFileSync(`${PG_BIN}/psql`, ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', url, '-c', sql]).toString().trim()

if (process.argv.includes('--seed')) {
  psql(`
    INSERT INTO "Tenant" ("id","name","slug","createdAt","updatedAt") VALUES ('${TENANT}','Perf','${TENANT}',now(),now()) ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "Branch" ("id","tenantId","name","isActive","createdAt","updatedAt") VALUES ('perf-branch','${TENANT}','Perf',true,now(),now()) ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "User" ("id","tenantId","name","pinHash","role","status","createdAt","updatedAt") VALUES ('perf-user','${TENANT}','Perf','x','ADMIN','ACTIVE',now(),now()) ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "Product" ("id","tenantId","branchId","sku","name","category","model","capacity","color","condition","pricePyg","costPyg","stock","isActive","createdAt","updatedAt")
      SELECT 'perf-p-'||i, '${TENANT}', 'perf-branch', 'PERF-'||lpad(i::text,6,'0'), 'iPhone 15 Pro Max PERF '||i, 'Celulares', 'iPhone 15 Pro Max', '256 GB', 'Titanio', 'NEW', 4200000, 3200000, 0, true, now() - (i||' minutes')::interval, now()
      FROM generate_series(1, ${PRODUCTOS}) i
      ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "Product" ("id","tenantId","branchId","sku","name","category","model","capacity","color","condition","pricePyg","costPyg","stock","isActive","createdAt","updatedAt")
      SELECT 'perf-x-'||i, '${TENANT}', 'perf-branch', 'PERFX-'||lpad(i::text,5,'0'), 'iPhone 13 mini PERF '||i, 'Celulares', 'iPhone 13 mini', '512 GB', 'Medianoche', 'USED', 1800000, 1200000, 0, true, now(), now()
      FROM generate_series(1, 150) i
      ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","condition","status","createdAt","updatedAt")
      SELECT 'perf-u-'||i, '${TENANT}', 'perf-p-'||i, 'perf-branch', 'PERFUNIT'||lpad(i::text,6,'0'), 'NEW', 'AVAILABLE', now(), now()
      FROM generate_series(1, ${UNIDADES}) i
      ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "Order" ("id","tenantId","branchId","sellerId","orderNumber","publicToken","status","fulfillmentStatus","subtotalPyg","totalPyg","createdAt","updatedAt")
      SELECT 'perf-o-'||i, '${TENANT}', 'perf-branch', 'perf-user', 'PERF#-'||lpad(i::text,6,'0'), 'perf-token-'||i, 'COMPLETED', 'DELIVERED', 100000, 100000, now() - (i||' minutes')::interval, now()
      FROM generate_series(1, ${PEDIDOS}) i
      ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "OrderItem" ("id","orderId","productId","description","quantity","unitPricePyg","totalPyg","costPending")
      SELECT 'perf-i-'||i, 'perf-o-'||i, 'perf-p-'||i, 'Item', 1, 100000, 100000, false
      FROM generate_series(1, ${PEDIDOS}) i
      ON CONFLICT ("id") DO NOTHING;
  `)
  console.log(`Sembrado: ${PRODUCTOS} productos, ${UNIDADES} unidades, ${PEDIDOS} pedidos con ítem.`)
}

const medir = (nombre, sql) => {
  const plan = psql(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`)
  const ms = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] || '?'
  const scan = /Seq Scan on "?(Product|InventoryUnit|Order)"?/.test(plan) ? 'seq scan' : /Index (Only )?Scan|Bitmap Index Scan/.test(plan) ? 'índice' : '—'
  console.log(`${nombre.padEnd(42)} ${String(ms).padStart(9)} ms   ${scan}`)
}

console.log('Consulta'.padEnd(42), 'Tiempo'.padStart(12), '  Plan')
medir('POS: producto por nombre', `SELECT "id" FROM "Product" WHERE "tenantId"='${TENANT}' AND "isActive" AND "name" ILIKE '%iPhone 15 Pro%' LIMIT 100`)
medir('POS: producto por SKU', `SELECT "id" FROM "Product" WHERE "tenantId"='${TENANT}' AND "isActive" AND "sku" ILIKE '%PERF-001234%' LIMIT 100`)
medir('POS: producto por modelo', `SELECT "id" FROM "Product" WHERE "tenantId"='${TENANT}' AND "isActive" AND "model" ILIKE '%Pro Max%' LIMIT 100`)
medir('POS: modelo selectivo (13 mini)', `SELECT \"id\" FROM \"Product\" WHERE \"tenantId\"='${TENANT}' AND \"isActive\" AND \"model\" ILIKE '%13 mini%' LIMIT 100`)
medir('POS: capacidad selectiva (512 GB)', `SELECT \"id\" FROM \"Product\" WHERE \"tenantId\"='${TENANT}' AND \"isActive\" AND \"capacity\" ILIKE '%512 GB%' LIMIT 100`)
medir('Inventario: unidad por serial', `SELECT "id" FROM "InventoryUnit" WHERE "tenantId"='${TENANT}' AND "serial" ILIKE '%UNIT001234%' LIMIT 100`)
medir('Pedidos: listado del POS (fecha desc)', `SELECT "id" FROM "Order" WHERE "tenantId"='${TENANT}' ORDER BY "createdAt" DESC LIMIT 100`)
medir('Kardex: ítems del producto', `SELECT "id" FROM "OrderItem" WHERE "productId"='perf-p-1234' LIMIT 100`)
medir('Kardex: unidades del producto', `SELECT "id" FROM "InventoryUnit" WHERE "tenantId"='${TENANT}' AND "productId"='perf-p-1234' LIMIT 100`)
