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

const findings = []
const fixed = []
const real = (domain, message) => findings.push({ domain, level: 'real', message })
const review = (domain, message) => findings.push({ domain, level: 'review', message })
const repaired = (domain, message) => fixed.push({ domain, message })

// ---- caja --------------------------------------------------------------------
// La sesión cerrada guarda expectedPyg = apertura + cobros CASH confirmados de
// la sucursal entre openedAt y closedAt. Los movimientos de caja (gastos,
// cheques) no entran en la fórmula de la ruta: solo la alteran si se editan a
// mano, y por eso se informan aparte.
// Nota de relojes: openedAt/closedAt nacen de CURRENT_TIMESTAMP (hora local de
// la base) y paidAt lo escribe Prisma (hora UTC). La ruta compara paidAt contra
// openedAt y contra el "ahora" de Node, así que el espejo exacto suma a
// closedAt el corrimiento de la base para recuperar el instante UTC. En bases
// UTC el término es cero y no cambia nada.
async function checkCaja() {
  const rotas = await prisma.$queryRaw`
    SELECT "id", "tenantId", "status",
      ("closedAt" IS NULL) AS "sinCierre",
      ("expectedPyg" IS NULL) AS "sinEsperado",
      ("countedPyg" IS NULL) AS "sinContado",
      ("closedById" IS NULL) AS "sinCajero"
    FROM "CashSession"
    WHERE ("status" = 'CLOSED' AND ("closedAt" IS NULL OR "expectedPyg" IS NULL OR "countedPyg" IS NULL OR "closedById" IS NULL))
       OR ("status" = 'OPEN' AND ("closedAt" IS NOT NULL OR "expectedPyg" IS NOT NULL OR "countedPyg" IS NOT NULL OR "closedById" IS NOT NULL))
    LIMIT 200`
  for (const row of rotas) {
    const detalle = row.status === 'CLOSED'
      ? `cierre incompleto (${[row.sinCierre && 'closedAt', row.sinEsperado && 'expectedPyg', row.sinContado && 'countedPyg', row.sinCajero && 'closedById'].filter(Boolean).join(', ')})`
      : 'sesión abierta con datos de cierre'
    real('caja', `CashSession ${row.id} (${row.tenantId}): ${detalle}`)
  }
  const abiertasDuplicadas = await prisma.$queryRaw`
    SELECT "tenantId", "branchId", count(*)::int AS "total"
    FROM "CashSession" WHERE "status" = 'OPEN'
    GROUP BY "tenantId", "branchId" HAVING count(*) > 1 LIMIT 100`
  for (const row of abiertasDuplicadas) {
    real('caja', `${row.tenantId} · ${row.branchId}: ${row.total} cajas abiertas a la vez (debe haber una)`)
  }
  const descuadres = await prisma.$queryRaw`
    SELECT cs."id", cs."tenantId", cs."branchId", cs."expectedPyg", cs."openingPyg", cs."openedAt", cs."closedAt",
      (cs."openingPyg" + COALESCE((
        SELECT SUM(p."amountPyg") FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
        WHERE p."tenantId" = cs."tenantId" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
          AND COALESCE(p."currency"::text, 'PYG') = 'PYG'
          AND o."tenantId" = cs."tenantId" AND o."branchId" = cs."branchId"
          AND p."paidAt" >= cs."openedAt"
          AND p."paidAt" <= cs."closedAt" - ((cs."closedAt" AT TIME ZONE 'UTC') - cs."closedAt")
      ), 0))::int AS "recalculado"
    FROM "CashSession" cs
    WHERE cs."status" = 'CLOSED' AND cs."closedAt" IS NOT NULL AND cs."expectedPyg" IS NOT NULL
    ORDER BY cs."tenantId", cs."openedAt" DESC
    LIMIT 500`
  const cuadres = descuadres.filter((row) => Number(row.expectedPyg) !== Number(row.recalculado))
  for (const row of cuadres) {
    if (fix) {
      await prisma.cashSession.update({ where: { id: row.id }, data: { expectedPyg: Number(row.recalculado) } })
      await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'CASH_EXPECTED_RECOMPUTED', entity: 'CashSession', entityId: row.id, metadata: { before: Number(row.expectedPyg), after: Number(row.recalculado), source: 'consistency-check.mjs' } } })
      repaired('caja', `CashSession ${row.id}: expectedPyg ${row.expectedPyg} → ${row.recalculado}`)
      continue
    }
    real('caja', `CashSession ${row.id} (${row.tenantId} · ${row.branchId}): expectedPyg=${row.expectedPyg}, recalculado=${row.recalculado}`)
  }
  const descuadresMovimiento = await prisma.$queryRaw`
    SELECT "id", "tenantId", "status", ("clearedAt" IS NULL) AS "sinFecha"
    FROM "CashMovement"
    WHERE ("status" = 'CLEARED' AND "clearedAt" IS NULL)
       OR ("status" IN ('PENDING', 'VOID') AND "clearedAt" IS NOT NULL)
    LIMIT 200`
  for (const row of descuadresMovimiento) {
    real('movimientos', `CashMovement ${row.id} (${row.tenantId}): estado ${row.status} sin coherencia con clearedAt`)
  }
  return descuadres.length
}

// ---- créditos ----------------------------------------------------------------
// El cobro confirmado nunca supera el total y el pedido pasa a COMPLETED justo
// al cubrirlo. Los reembolsos (REFUNDED) no pueden superar lo cobrado.
async function checkCreditos() {
  const pedidos = await prisma.$queryRaw`
    SELECT o."id", o."tenantId", o."orderNumber", o."status", o."totalPyg", o."creditDays", o."dueAt", o."createdAt",
      COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0)::int AS "confirmado",
      COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'REFUNDED'), 0)::int AS "reembolsado"
    FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o."id"
    GROUP BY o."id"
    HAVING COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'REFUNDED'), 0) > COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0)
      OR (o."status" <> 'CANCELLED' AND COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0) > o."totalPyg")
      OR (o."status" = 'COMPLETED' AND COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0) < o."totalPyg")
      OR (o."status" = 'PENDING' AND o."totalPyg" > 0 AND COALESCE(SUM(p."amountPyg") FILTER (WHERE p."status" = 'CONFIRMED'), 0) >= o."totalPyg")
      OR (o."creditDays" > 0 AND o."dueAt" IS NULL)
    ORDER BY o."tenantId", o."createdAt" DESC
    LIMIT 500`
  for (const row of pedidos) {
    if (Number(row.reembolsado) > Number(row.confirmado)) {
      real('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): reembolsado ${row.reembolsado} supera lo cobrado ${row.confirmado}`)
    } else if (row.status !== 'CANCELLED' && Number(row.confirmado) > Number(row.totalPyg)) {
      real('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): cobrado ${row.confirmado} supera el total ${row.totalPyg}`)
    } else if (row.status === 'COMPLETED' && Number(row.confirmado) < Number(row.totalPyg)) {
      real('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): COMPLETED con ${row.confirmado} de ${row.totalPyg} cobrados`)
    } else if (row.status === 'PENDING' && Number(row.confirmado) >= Number(row.totalPyg)) {
      real('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): PENDING con el total cubierto (${row.confirmado}/${row.totalPyg})`)
    } else {
      real('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): crédito de ${row.creditDays} días sin vencimiento (dueAt)`)
    }
  }
  const vencidos = await prisma.$queryRaw`
    SELECT "id", "tenantId", "orderNumber" FROM "Order"
    WHERE "dueAt" IS NOT NULL AND "dueAt" < "createdAt" - interval '1 day' LIMIT 100`
  for (const row of vencidos) review('créditos', `Pedido ${row.orderNumber} (${row.tenantId}): vencimiento anterior a la venta`)
  return pedidos.length
}

// ---- comisiones --------------------------------------------------------------
// Cada regla aplica a un usuario o a un rol (nunca ambos) con porcentaje
// 0–100, y el usuario debe pertenecer a la empresa. La comisión se calcula
// sobre el margen: las banderas de costo de las líneas se informan.
async function checkComisiones() {
  const malas = await prisma.$queryRaw`
    SELECT r."id", r."tenantId", r."userId", r.role, r."percentPyg"
    FROM "CommissionRule" r
    WHERE (r."userId" IS NULL) = (r.role IS NULL)
       OR r."percentPyg" IS NULL OR r."percentPyg" < 0 OR r."percentPyg" > 100
       OR (r."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = r."userId" AND u."tenantId" = r."tenantId"))
    LIMIT 200`
  for (const row of malas) {
    const motivo = row.userId && row.role ? 'aplica a usuario y rol a la vez'
      : !row.userId && !row.role ? 'sin usuario ni rol'
      : row.percentPyg === null ? 'sin porcentaje' : 'porcentaje fuera de 0–100 o usuario de otra empresa'
    real('comisiones', `Regla ${row.id} (${row.tenantId}): ${motivo}`)
  }
  const duplicadas = await prisma.$queryRaw`
    SELECT "tenantId", "userId", "role", count(*)::int AS "total"
    FROM "CommissionRule"
    WHERE "userId" IS NOT NULL OR role IS NOT NULL
    GROUP BY "tenantId", "userId", "role" HAVING count(*) > 1 LIMIT 100`
  for (const row of duplicadas) {
    review('comisiones', `${row.tenantId}: ${row.total} reglas para ${row.userId ? `usuario ${row.userId}` : `rol ${row.role}`} (prevalece una; revisar duplicados)`)
  }
  const lineas = await prisma.$queryRaw`
    SELECT oi."id", o."tenantId", o."orderNumber", oi."costPending", oi."unitCostPyg"
    FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
    WHERE oi."productId" IS NOT NULL
      AND ((oi."costPending" = true AND oi."unitCostPyg" IS NOT NULL) OR (oi."costPending" = false AND oi."unitCostPyg" IS NULL))
    LIMIT 200`
  for (const row of lineas) {
    review('comisiones', `Línea ${row.id} del pedido ${row.orderNumber} (${row.tenantId}): costPending=${row.costPending} con costo ${row.unitCostPyg ?? 'nulo'} (revisar margen)`)
  }
  return malas.length
}

// ---- promociones -------------------------------------------------------------
// usedUnits es el espejo de las unidades entregadas con cada cupón: la fuente
// es promotionSnapshot de la línea. --fix sube el contador al consumo real
// (nunca lo baja: un espejo incompleto de datos viejos no debe habilitar más
// cupones) y corrige valores negativos.
async function checkPromociones() {
  const filas = await prisma.$queryRaw`
    SELECT p."id", p."tenantId", p."code", p."usedUnits", p."maxUnits", COALESCE(d."usado", 0)::int AS "derivado"
    FROM "Promotion" p
    LEFT JOIN (
      SELECT (oi."promotionSnapshot"->>'id') AS "promotionId", SUM(oi.quantity)::int AS "usado"
      FROM "OrderItem" oi
      WHERE oi."promotionSnapshot" IS NOT NULL AND (oi."promotionSnapshot"->>'id') IS NOT NULL
      GROUP BY 1
    ) d ON d."promotionId" = p."id"
    WHERE p."usedUnits" < 0 OR COALESCE(d."usado", 0) <> p."usedUnits" OR (p."maxUnits" IS NOT NULL AND p."usedUnits" > p."maxUnits")
    ORDER BY p."tenantId", p."code"
    LIMIT 500`
  for (const row of filas) {
    const usado = Number(row.usedUnits)
    const derivado = Number(row.derivado)
    if (row.maxUnits !== null && usado > Number(row.maxUnits)) {
      real('promociones', `Cupón ${row.code} (${row.tenantId}): ${usado} usos superan el límite ${row.maxUnits}`)
      continue
    }
    if (usado >= 0 && derivado < usado) {
      // Un espejo incompleto (datos viejos) no habilita más cupones: se informa.
      review('promociones', `Cupón ${row.code} (${row.tenantId}): usedUnits=${usado} por encima del consumo real ${derivado} (revisar a mano)`)
      continue
    }
    if (fix) {
      const nuevo = Math.max(0, derivado)
      await prisma.promotion.update({ where: { id: row.id }, data: { usedUnits: nuevo } })
      await prisma.auditLog.create({ data: { tenantId: row.tenantId, action: 'PROMOTION_USES_RECOMPUTED', entity: 'Promotion', entityId: row.id, metadata: { before: usado, after: nuevo, source: 'consistency-check.mjs' } } })
      repaired('promociones', `Cupón ${row.code}: usedUnits ${usado} → ${nuevo}`)
      continue
    }
    if (usado < 0) real('promociones', `Cupón ${row.code} (${row.tenantId}): usedUnits negativo (${usado})`)
    else real('promociones', `Cupón ${row.code} (${row.tenantId}): usedUnits=${usado} por debajo del consumo real ${derivado}`)
  }
  const huerfanos = await prisma.$queryRaw`
    SELECT DISTINCT (oi."promotionSnapshot"->>'id') AS "promotionId", o."tenantId"
    FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
    WHERE oi."promotionSnapshot" IS NOT NULL AND (oi."promotionSnapshot"->>'id') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Promotion" p WHERE p."id" = (oi."promotionSnapshot"->>'id'))
    LIMIT 100`
  for (const row of huerfanos) review('promociones', `${row.tenantId}: líneas con el cupón ${row.promotionId} ya eliminado`)
  return filas.length
}

// ---- garantías ---------------------------------------------------------------
// El caso de garantía debe apuntar a una venta/cliente de la misma empresa y
// el vencimiento no puede ser anterior a la recepción.
async function checkGarantias() {
  const cruzadas = await prisma.$queryRaw`
    SELECT w."id", w."tenantId", w."serial", w."orderItemId", w."customerId"
    FROM "WarrantyCase" w
    WHERE (w."orderItemId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE oi."id" = w."orderItemId" AND o."tenantId" = w."tenantId"))
      OR (w."customerId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Customer" c WHERE c."id" = w."customerId" AND c."tenantId" = w."tenantId"))
    LIMIT 200`
  for (const row of cruzadas) {
    real('garantías', `Caso ${row.id} (${row.tenantId} · ${row.serial}): ${row.orderItemId ? 'venta' : 'cliente'} de otra empresa o inexistente`)
  }
  const vencidas = await prisma.$queryRaw`
    SELECT "id", "tenantId", "serial" FROM "WarrantyCase"
    WHERE "expiresAt" IS NOT NULL AND "expiresAt" < "createdAt" LIMIT 100`
  for (const row of vencidas) {
    real('garantías', `Caso ${row.id} (${row.tenantId} · ${row.serial}): vencimiento anterior a la recepción`)
  }
  const coberturasVacias = await prisma.$queryRaw`
    SELECT "id", "tenantId", "serial" FROM "WarrantyCase"
    WHERE "kind" = 'COVERAGE' AND "warrantyDays" IS NULL AND "expiresAt" IS NULL LIMIT 100`
  for (const row of coberturasVacias) {
    review('garantías', `Caso ${row.id} (${row.tenantId} · ${row.serial}): cobertura sin días ni vencimiento`)
  }
  const seriales = await prisma.$queryRaw`
    SELECT w."id", w."tenantId", w."serial", oi."serials"
    FROM "WarrantyCase" w JOIN "OrderItem" oi ON oi."id" = w."orderItemId"
    WHERE w."serial" IS NOT NULL AND jsonb_typeof(oi."serials") = 'array' AND jsonb_array_length(oi."serials") > 0
      AND NOT (oi."serials" ? w."serial")
    LIMIT 200`
  for (const row of seriales) {
    review('garantías', `Caso ${row.id} (${row.tenantId}): el serial ${row.serial} no figura en la venta asociada`)
  }
  return cruzadas.length + vencidas.length
}

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
  for (const item of fixed) console.log(`CORREGIDO · ${item.message}`)
  const reales = findings.filter((item) => item.level === 'real')
  const revisables = findings.filter((item) => item.level === 'review')
  if (reales.length) {
    console.log(`consistency: ${reales.length} inconsistencia(s) real(es)${fix ? ' tras --fix' : ''}; ${revisables.length} revisable(s).`)
    if (!fix) console.log('Volvé a correr con --fix para recomponer los espejos derivados seguros.')
    process.exitCode = 1
  } else {
    console.log(`consistency: OK (${revisables.length} revisable(s) informadas).`)
  }
} finally {
  await prisma.$disconnect()
}
