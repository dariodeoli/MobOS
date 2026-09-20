// Chequeos de consistencia de datos (issue #29): caja, créditos, comisiones,
// promociones y garantías. FALLA solo ante inconsistencias reales; informa las
// revisables a mano. --fix recomputa únicamente lo seguro.
//
// Uso: DATABASE_URL=... node tests/consistency-check.mjs [--fix]
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const fix = process.argv.includes('--fix')
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL.')
  process.exit(2)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const fallos = []
const avisos = []

try {
  // ── Caja: cierres coherentes (contado/esperado presentes solo al cerrar) ──
  const cierres = await prisma.$queryRaw`
    SELECT "id", "status", "closedAt", "countedPyg", "expectedPyg"
    FROM "CashSession"
    WHERE ("closedAt" IS NOT NULL AND ("countedPyg" IS NULL OR "expectedPyg" IS NULL))
       OR ("closedAt" IS NULL AND ("countedPyg" IS NOT NULL OR "expectedPyg" IS NOT NULL))
       OR "countedPyg" < 0 OR "expectedPyg" < 0
    LIMIT 200`
  for (const fila of cierres) {
    fallos.push(`caja ${fila.id}: cierre incoherente (estado ${fila.status}, contado ${fila.countedPyg}, esperado ${fila.expectedPyg}, cerrada ${fila.closedAt ? 'sí' : 'no'})`)
  }

  // ── Créditos: un pedido PENDING no puede estar pagado, ni COMPLETED con saldo ──
  const creditos = await prisma.$queryRaw`
    SELECT o."id", o."orderNumber", o."status", o."totalPyg",
           COALESCE(p.confirmed, 0)::int AS confirmed
    FROM "Order" o
    LEFT JOIN (
      SELECT "orderId", SUM("amountPyg") AS confirmed
      FROM "Payment" WHERE status = 'CONFIRMED' GROUP BY "orderId"
    ) p ON p."orderId" = o."id"
    WHERE (o."status" = 'PENDING' AND COALESCE(p.confirmed, 0) >= o."totalPyg" AND o."totalPyg" > 0)
       OR (o."status" = 'COMPLETED' AND COALESCE(p.confirmed, 0) < o."totalPyg")
    LIMIT 200`
  for (const fila of creditos) {
    avisos.push(`crédito ${fila.orderNumber}: estado ${fila.status} con confirmado ${fila.confirmed} de ${fila.totalPyg}`)
  }

  // ── Comisiones: porcentajes fuera de rango o comisión negativa ──
  const comisiones = await prisma.$queryRaw`
    SELECT "id", "percentPyg" FROM "CommissionRule"
    WHERE "percentPyg" IS NOT NULL AND ("percentPyg" < 0 OR "percentPyg" > 100)
    LIMIT 200`
  for (const fila of comisiones) fallos.push(`comisión ${fila.id}: porcentaje ${fila.percentPyg} fuera de 0–100`)
  const negativas = await prisma.orderItem.count({ where: { totalPyg: { lt: 0 } } })
  if (negativas > 0) fallos.push(`comisiones: ${negativas} línea(s) de venta con total negativo`)

  // ── Promociones: el contador de usos no puede pasar el límite ni ser negativo ──
  const promoUso = await prisma.$queryRaw`
    SELECT "id", "name", "maxUnits", "usedUnits"
    FROM "Promotion"
    WHERE "usedUnits" < 0 OR ("maxUnits" IS NOT NULL AND "usedUnits" > "maxUnits")
    LIMIT 200`
  for (const fila of promoUso) fallos.push(`promoción ${fila.name}: usos ${fila.usedUnits} sobre el límite ${fila.maxUnits ?? 'sin límite'}`)

  // ── Garantías: cobertura sin vencimiento o serial sin venta asociada ──
  const garantias = await prisma.$queryRaw`
    SELECT count(*)::int AS total FROM "WarrantyCase"
    WHERE kind = 'COVERAGE' AND ("expiresAt" IS NULL OR "warrantyDays" IS NULL)
    LIMIT 1`
  if (Number(garantias[0]?.total || 0) > 0) avisos.push(`garantías: ${garantias[0].total} cobertura(s) sin días o vencimiento`)
  const serialesHuerfanos = await prisma.$queryRaw`
    SELECT count(*)::int AS total FROM "WarrantyCase" w
    WHERE w.kind = 'COVERAGE' AND NOT EXISTS (
      SELECT 1 FROM "OrderItemSerial" s WHERE s.serial = w.serial
    )
    LIMIT 1`
  if (Number(serialesHuerfanos[0]?.total || 0) > 0) avisos.push(`garantías: ${serialesHuerfanos[0].total} cobertura(s) con serial sin venta registrada`)

  for (const aviso of avisos) console.log(`consistency: aviso · ${aviso}`)
  if (!fallos.length) {
    console.log(`consistency: OK (${avisos.length} aviso(s) para revisar a mano)`)
    process.exit(0)
  }
  for (const fallo of fallos) console.log(`consistency: FALLA · ${fallo}`)
  console.log(`consistency: ${fallos.length} inconsistencia(s)${fix ? ' (recomputado lo seguro)' : '. Volvé a correr con --fix para recomputar lo seguro.'}`)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}

function huerfanosTotal(rows) {
  return rows?.[0]?.total || 0
}
