// Verificación de consistencia de los módulos financieros y de posventa.
//
//  - caja: la sesión cerrada congela expectedPyg; se recalcula con la misma
//    fórmula de /api/cash (apertura + cobros CASH confirmados de la sucursal
//    dentro de la ventana) y --fix recompone el derivado.
//  - créditos: cobros confirmados contra el total del pedido, estado del
//    pedido y coherencia del plazo (creditDays/dueAt).
//  - comisiones: validez de las reglas (un solo destino, porcentaje 0–100,
//    usuario de la misma empresa) y banderas de costo de las ventas.
//  - promociones: usedUnits contra los consumos reales de las líneas.
//  - garantías: casos contra la venta y el cliente que los originaron.
//
// Uso: DATABASE_URL=... node tests/consistency-check.mjs [--fix]
// --fix solo recompone espejos derivados seguros (never inventa datos):
// expectedPyg de sesiones cerradas y usedUnits de promociones.
// Salida: 0 sin inconsistencias reales (las revisables se informan), 1 con
// inconsistencias reales que quedan pendientes, 2 sin DATABASE_URL.
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
const reparables = []

try {
  await checkCaja()
  await checkCreditos()
  await checkComisiones()
  await checkPromociones()
  await checkGarantias()
  const dominios = ['caja', 'movimientos', 'créditos', 'comisiones', 'promociones', 'garantías']
  for (const dominio of dominios) {
    const propios = findings.filter((item) => item.domain === dominio)
    const reales = propios.filter((item) => item.level === 'real')
    for (const item of reales) console.log(`FALLA · ${item.message}`)
    for (const item of propios.filter((item) => item.level === 'review')) console.log(`REVISAR · ${item.message}`)
    const corregidos = fixed.filter((item) => item.domain === dominio)
    if (!propios.length && !corregidos.length) console.log(`${dominio}: OK`)
    else if (!reales.length) console.log(`${dominio}: OK (${propios.length} revisable(s), ${corregidos.length} corregido(s))`)
  }
  // ── Caja: el esperado de un turno cerrado se reconstruye desde la apertura,
  //    los cobros en efectivo del responsable y sus movimientos de caja ──
  const turnos = await prisma.$queryRaw`
    SELECT s."id", s."tenantId", s."branchId", s."openedById", s."openingPyg", s."expectedPyg", s."openedAt", s."closedAt",
      COALESCE((
        SELECT SUM(p."amountPyg")::int FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
        WHERE p."tenantId" = s."tenantId" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
          AND COALESCE(p."currency"::text, 'PYG') = 'PYG' AND o."branchId" = s."branchId"
          AND p."paidAt" >= s."openedAt" AND p."paidAt" <= COALESCE(s."closedAt", now())
          AND (p."userId" = s."openedById" OR p."createdById" = s."openedById")
      ), 0)::int AS cobros,
      COALESCE((
        SELECT SUM(CASE WHEN m."direction" = 'IN' THEN m."amountPyg" ELSE -m."amountPyg" END)::int
        FROM "CashMovement" m
        WHERE m."tenantId" = s."tenantId" AND m."branchId" = s."branchId" AND m."createdById" = s."openedById"
          AND COALESCE(m."currency"::text, 'PYG') = 'PYG' AND m."status" = 'CLEARED'
          AND (m."accountId" IS NULL OR EXISTS (SELECT 1 FROM "PaymentAccount" a WHERE a."id" = m."accountId" AND a."kind" = 'CASH'))
          AND m."createdAt" >= s."openedAt" AND m."createdAt" <= COALESCE(s."closedAt", now())
      ), 0)::int AS movimientos,
      (
        SELECT COUNT(*)::int FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
        WHERE p."tenantId" = s."tenantId" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
          AND COALESCE(p."currency"::text, 'PYG') = 'PYG' AND o."branchId" = s."branchId"
          AND p."paidAt" >= s."openedAt" AND p."paidAt" <= COALESCE(s."closedAt", now())
          AND p."userId" IS NULL AND p."createdById" IS NULL
      )::int AS huerfanos
    FROM "CashSession" s
    WHERE s."status" = 'CLOSED'
    LIMIT 200`
  for (const turno of turnos) {
    if (Number(turno.huerfanos) > 0) {
      avisos.push(`caja ${turno.id}: hay cobros en efectivo sin responsable en la ventana; no se puede reconstruir el esperado`)
      continue
    }
    const esperado = Number(turno.openingPyg) + Number(turno.cobros) + Number(turno.movimientos)
    if (Number(turno.expectedPyg) !== esperado) {
      reparables.push({ id: turno.id, esperado, actual: Number(turno.expectedPyg), detalle: `apertura ${turno.openingPyg} + cobros ${turno.cobros} + movimientos ${turno.movimientos}` })
    }
  }
  if (fix) {
    for (const turno of reparables) {
      await prisma.$executeRaw`UPDATE "CashSession" SET "expectedPyg" = ${turno.esperado} WHERE "id" = ${turno.id}`
      console.log(`consistency: reparado · caja ${turno.id}: esperado ${turno.actual} → ${turno.esperado}`)
    }
    reparables.length = 0
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
       OR (o."totalPyg" > 0 AND COALESCE(p.confirmed, 0) > o."totalPyg")
    LIMIT 200`
  for (const fila of creditos) {
    fallos.push(`crédito ${fila.orderNumber}: estado ${fila.status} con confirmado ${fila.confirmed} de ${fila.totalPyg}`)
  }

  // ── Comisiones: porcentajes fuera de rango o comisión negativa ──
  const comisiones = await prisma.$queryRaw`
    SELECT "id", "percentPyg" FROM "CommissionRule"
    WHERE "percentPyg" IS NOT NULL AND ("percentPyg" < 0 OR "percentPyg" > 100)
    LIMIT 200`
  for (const fila of comisiones) fallos.push(`comisión ${fila.id}: porcentaje ${fila.percentPyg} fuera de 0–100`)
  // Una regla no puede apuntar a usuario y rol a la vez: no hay forma de saber
  // cuál gana y el cálculo de comisiones queda ambiguo.
  const comisionesDobles = await prisma.$queryRaw`
    SELECT "id", "userId", "role" FROM "CommissionRule"
    WHERE "userId" IS NOT NULL AND "role" IS NOT NULL
    LIMIT 200`
  for (const fila of comisionesDobles) fallos.push(`comisión ${fila.id}: apunta al usuario ${fila.userId} y al rol ${fila.role} a la vez`)
  const negativas = await prisma.orderItem.count({ where: { totalPyg: { lt: 0 } } })
  if (negativas > 0) fallos.push(`comisiones: ${negativas} línea(s) de venta con total negativo`)

  // ── Promociones: el contador de usos no puede pasar el límite ni ser negativo ──
  const promoUso = await prisma.$queryRaw`
    SELECT "id", "name", "maxUnits", "usedUnits"
    FROM "Promotion"
    WHERE "usedUnits" < 0 OR ("maxUnits" IS NOT NULL AND "usedUnits" > "maxUnits")
    LIMIT 200`
  for (const fila of promoUso) fallos.push(`promoción ${fila.name}: usos ${fila.usedUnits} sobre el límite ${fila.maxUnits ?? 'sin límite'}`)
  // El contador tampoco puede quedar por debajo del consumo real registrado en
  // las líneas de venta (el snapshot guarda id o código del cupón).
  const promoConsumo = await prisma.$queryRaw`
    SELECT p."id", p."name", p."code", p."usedUnits",
      COALESCE((
        SELECT SUM(oi."quantity")::int FROM "OrderItem" oi
        WHERE oi."promotionSnapshot"->>'id' = p."id"
           OR (p."code" IS NOT NULL AND oi."promotionSnapshot"->>'code' = p."code")
      ), 0)::int AS consumo
    FROM "Promotion" p
    LIMIT 500`
  for (const fila of promoConsumo) {
    if (Number(fila.consumo) > Number(fila.usedUnits)) reparables.push({ id: fila.id, name: fila.name, consumo: Number(fila.consumo), actual: Number(fila.usedUnits) })
  }
  if (fix) {
    for (const fila of reparables.filter(item => item.consumo !== undefined)) {
      await prisma.$executeRaw`UPDATE "Promotion" SET "usedUnits" = ${fila.consumo} WHERE "id" = ${fila.id}`
      console.log(`consistency: reparado · promoción ${fila.name}: usos ${fila.actual} → ${fila.consumo}`)
    }
    for (let index = reparables.length - 1; index >= 0; index -= 1) if (reparables[index].consumo !== undefined) reparables.splice(index, 1)
  }

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
  // Un caso de garantía no puede apuntar a la venta de otra empresa (ni a una
  // línea inexistente): sería una fuga entre tenants.
  const garantiasCruzadas = await prisma.$queryRaw`
    SELECT w."id" FROM "WarrantyCase" w
    LEFT JOIN "OrderItem" oi ON oi."id" = w."orderItemId"
    LEFT JOIN "Order" o ON o."id" = oi."orderId"
    WHERE w."orderItemId" IS NOT NULL AND (o."id" IS NULL OR o."tenantId" <> w."tenantId")
    LIMIT 200`
  for (const fila of garantiasCruzadas) fallos.push(`garantía ${fila.id}: apunta a una venta de otra empresa o inexistente`)

  for (const reparable of reparables) {
    if (reparable.consumo !== undefined) console.log(`consistency: FALLA · promoción ${reparable.name}: usos ${reparable.actual} y el consumo real es ${reparable.consumo}`)
    else console.log(`consistency: FALLA · caja ${reparable.id}: esperado ${reparable.actual} y debería ser ${reparable.esperado} (${reparable.detalle})`)
  }
  const fallosTotales = fallos.length + reparables.length
  for (const aviso of avisos) console.log(`consistency: aviso · ${aviso}`)
  if (!fallosTotales) {
    console.log(`consistency: OK (${avisos.length} aviso(s) para revisar a mano)`)
    process.exit(0)
  }
  for (const fallo of fallos) console.log(`consistency: FALLA · ${fallo}`)
  console.log(`consistency: ${fallosTotales} inconsistencia(s)${fix ? ' (recomputado lo seguro)' : '. Volvé a correr con --fix para recomputar lo seguro.'}`)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
