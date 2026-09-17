// Verificación de consistencia del stock agregado por unidad física:
//  - FALLA si Product.stock es MENOR que las unidades disponibles+reservadas
//    (imposible: hay equipos sin respaldo de stock).
//  - INFORMA si stock es mayor (puede ser stock sin serie del mismo producto;
//    se revisa a mano para no borrar mercadería legítima).
// Uso: DATABASE_URL=... node tests/stock-consistency.mjs [--fix]
// --fix corrige únicamente los faltantes (sube el stock al número de unidades).
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const fix = process.argv.includes('--fix')
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL.')
  process.exit(2)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

try {
  const deficits = await prisma.$queryRaw`
    SELECT p."id", p."tenantId", p."sku", p."name", p."stock",
      (SELECT count(*) FROM "InventoryUnit" u WHERE u."productId" = p."id" AND u."status" IN ('AVAILABLE', 'RESERVED'))::int AS units
    FROM "Product" p
    WHERE p."isActive" = true
      AND EXISTS (SELECT 1 FROM "InventoryUnit" u2 WHERE u2."productId" = p."id")
      AND p."stock" < (SELECT count(*) FROM "InventoryUnit" u WHERE u."productId" = p."id" AND u."status" IN ('AVAILABLE', 'RESERVED'))
    ORDER BY p."tenantId", p."name"
    LIMIT 500`
  const surplus = await prisma.$queryRaw`
    SELECT count(*)::int AS total
    FROM "Product" p
    WHERE p."isActive" = true
      AND EXISTS (SELECT 1 FROM "InventoryUnit" u2 WHERE u2."productId" = p."id")
      AND p."stock" > (SELECT count(*) FROM "InventoryUnit" u WHERE u."productId" = p."id" AND u."status" IN ('AVAILABLE', 'RESERVED'))`
  if (surplus[0]?.total > 0) console.log(`stock-consistency: ${surplus[0].total} producto(s) con stock mayor a las unidades (puede ser stock sin serie; revisar a mano).`)
  if (!deficits.length) {
    console.log('stock-consistency: OK (sin faltantes de stock)')
    process.exit(0)
  }
  for (const row of deficits) console.log(`FALTA ${row.tenantId} · ${row.sku} · ${row.name}: stock=${row.stock} unidades=${row.units}`)
  if (!fix) {
    console.log(`stock-consistency: ${deficits.length} faltante(s). Volvé a correr con --fix para recomponer el stock desde las unidades.`)
    process.exit(1)
  }
  for (const row of deficits) {
    await prisma.product.update({ where: { id: row.id }, data: { stock: row.units } })
    await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'STOCK_RECOMPUTED', entity: 'Product', entityId: row.id, metadata: { before: row.stock, after: row.units, source: 'stock-consistency.mjs' } } })
  }
  console.log(`stock-consistency: ${deficits.length} faltante(s) recomputado(s) desde las unidades.`)
} finally {
  await prisma.$disconnect()
}
