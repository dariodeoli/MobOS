// Autotest del chequeo de consistencia (consistency-check.mjs).
//
// Siembra una inconsistencia real por dominio, comprueba que el comando falle
// con exit 1, recompone con --fix los espejos derivados seguros y verifica que
// la base vuelva a dar verde. Trabaja sobre una empresa propia y aislada que
// crea y borra al final, así que la base solo necesita estar migrada.
//
// Uso: DATABASE_URL=... node tests/consistency-selftest.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL.')
  process.exit(2)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
const checker = fileURLToPath(new URL('./consistency-check.mjs', import.meta.url))
const TENANT = 'tenant-consistency-selftest'
const OTHER_TENANT = 'tenant-consistency-selftest-b'
const BRANCH = `${TENANT}-branch`
const OTHER_BRANCH = `${OTHER_TENANT}-branch`
const USER = `${TENANT}-admin`
const OTHER_USER = `${OTHER_TENANT}-admin`
const stamp = Date.now().toString(36)

let checks = 0
function ok(condition, label) {
  if (!condition) throw new Error(`FALLÓ: ${label}`)
  checks += 1
  console.log(`ok · ${label}`)
}

function run(fix = false, { expect } = {}) {
  const args = [checker, ...(fix ? ['--fix'] : [])]
  const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8' })
  if (expect !== undefined && result.status !== expect) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`consistency-check exit ${result.status}, esperado ${expect}${fix ? ' (--fix)' : ''}`)
  }
  return result
}

async function cleanup() {
  if (!prisma) return
  try {
    await prisma.$executeRaw`DELETE FROM "WarrantyCase" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
    await prisma.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT}))`
    await prisma.$executeRaw`DELETE FROM "Payment" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
    await prisma.$executeRaw`DELETE FROM "Order" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
    await prisma.$executeRaw`DELETE FROM "CashSession" WHERE "tenantId" = ${TENANT}`
    await prisma.$executeRaw`DELETE FROM "Promotion" WHERE "tenantId" = ${TENANT}`
    await prisma.$executeRaw`DELETE FROM "CommissionRule" WHERE "tenantId" = ${TENANT}`
    await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
    await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`
  } catch (error) {
    console.error('No se pudo limpiar la empresa de prueba:', error?.message || error)
  }
  await prisma.$disconnect()
}

async function seedTenant(id, branchId, userId, suffix) {
  await prisma.$executeRaw`
    INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt") VALUES (${id}, ${`Consistencia ${suffix}`}, ${`consistency-${suffix}-${stamp}`}, CURRENT_TIMESTAMP)`
  await prisma.$executeRaw`
    INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt") VALUES (${branchId}, ${id}, ${`Sucursal ${suffix}`}, CURRENT_TIMESTAMP)`
  // PIN sintético: la empresa de prueba no inicia sesión, solo sostiene las FK.
  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "tenantId", "branchId", "name", "role", "status", "pinHash", "updatedAt")
    VALUES (${userId}, ${id}, ${branchId}, ${`Admin ${suffix}`}, 'ADMIN', 'ACTIVE', '$2a$10$consistency.selftest.only', CURRENT_TIMESTAMP)`
}

async function seedOrder(id, tenantId, userId, orderNumber, status, totalPyg, branchId = null) {
  // publicToken es @default(cuid()) y lo completa Prisma, no la base: en SQL
  // directo hay que pasarlo.
  await prisma.$executeRaw`
    INSERT INTO "Order" ("id", "tenantId", "branchId", "sellerId", "orderNumber", "publicToken", "status", "subtotalPyg", "totalPyg", "updatedAt")
    VALUES (${id}, ${tenantId}, ${branchId}, ${userId}, ${orderNumber}, ${`tok-${id}`}, ${status}, ${totalPyg}, ${totalPyg}, CURRENT_TIMESTAMP)`
}

async function main() {
  await cleanup()
  run(false, { expect: 0 })
  checks += 1
  console.log('ok · base migrada y sin datos da verde')

  await seedTenant(TENANT, BRANCH, USER, 'A')
  await seedTenant(OTHER_TENANT, OTHER_BRANCH, OTHER_USER, 'B')

  // --- caja: espejo derivado (--fix recompone expectedPyg) ---
  const cashOrder = `${TENANT}-cash-order`
  await seedOrder(cashOrder, TENANT, USER, `CONSIST-CASH-${stamp}`, 'COMPLETED', 1000, BRANCH)
  await prisma.$executeRaw`
    INSERT INTO "Payment" ("id", "tenantId", "orderId", "method", "status", "amountPyg", "userId", "createdById", "paidAt", "createdAt")
    VALUES (${`${TENANT}-cash-payment`}, ${TENANT}, ${cashOrder}, 'CASH', 'CONFIRMED', 1000, ${USER}, ${USER}, (now() AT TIME ZONE 'UTC') - interval '5 minutes', CURRENT_TIMESTAMP)`
  await prisma.$executeRaw`
    INSERT INTO "CashSession" ("id", "tenantId", "branchId", "openedById", "closedById", "openingPyg", "countedPyg", "expectedPyg", "status", "openedAt", "closedAt")
    VALUES (${`${TENANT}-cash-session`}, ${TENANT}, ${BRANCH}, ${USER}, ${USER}, 500, 0, 1, 'CLOSED', (now() AT TIME ZONE 'UTC') - interval '1 hour', (now() AT TIME ZONE 'UTC'))`
  run(false, { expect: 1 })
  checks += 1
  console.log('ok · caja: un expectedPyg descuadrado hace fallar el chequeo')
  run(true, { expect: 0 })
  const caja = await prisma.$queryRaw`SELECT "expectedPyg" FROM "CashSession" WHERE "id" = ${`${TENANT}-cash-session`}`
  ok(Number(caja[0]?.expectedPyg) === 1500, 'caja: --fix recompone expectedPyg desde apertura + cobros')

  // --- créditos: cobro confirmado por encima del total (no se inventa un arreglo) ---
  const creditOrder = `${TENANT}-credit-order`
  await seedOrder(creditOrder, TENANT, USER, `CONSIST-CREDIT-${stamp}`, 'COMPLETED', 1000)
  await prisma.$executeRaw`
    INSERT INTO "Payment" ("id", "tenantId", "orderId", "method", "status", "amountPyg", "paidAt", "createdAt")
    VALUES (${`${TENANT}-credit-payment`}, ${TENANT}, ${creditOrder}, 'CASH', 'CONFIRMED', 1200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  run(false, { expect: 1 })
  checks += 1
  console.log('ok · créditos: un cobro mayor al total hace fallar el chequeo')
  await prisma.$executeRaw`DELETE FROM "Payment" WHERE "id" = ${`${TENANT}-credit-payment`}`
  await prisma.$executeRaw`DELETE FROM "Order" WHERE "id" = ${creditOrder}`

  // --- comisiones: regla con usuario y rol a la vez (no hay arreglo seguro) ---
  await prisma.$executeRaw`
    INSERT INTO "CommissionRule" ("id", "tenantId", "userId", "role", "percentPyg", "updatedAt")
    VALUES (${`${TENANT}-rule`}, ${TENANT}, ${USER}, 'VENDEDOR', 5, CURRENT_TIMESTAMP)`
  run(false, { expect: 1 })
  checks += 1
  console.log('ok · comisiones: una regla con doble destino hace fallar el chequeo')
  await prisma.$executeRaw`DELETE FROM "CommissionRule" WHERE "id" = ${`${TENANT}-rule`}`

  // --- promociones: consumo real por encima del contador (--fix sube usedUnits) ---
  const promoOrder = `${TENANT}-promo-order`
  await seedOrder(promoOrder, TENANT, USER, `CONSIST-PROMO-${stamp}`, 'COMPLETED', 0)
  await prisma.$executeRaw`
    INSERT INTO "Promotion" ("id", "tenantId", "code", "name", "kind", "value", "startsAt", "endsAt", "maxUnits", "usedUnits", "isActive", "updatedAt")
    VALUES (${`${TENANT}-promo`}, ${TENANT}, ${`CONSIST${stamp}`.toUpperCase()}, 'Cupón de consistencia', 'FIXED', 100, CURRENT_TIMESTAMP - interval '1 day', CURRENT_TIMESTAMP + interval '1 day', 10, 0, true, CURRENT_TIMESTAMP)`
  await prisma.$executeRaw`
    INSERT INTO "OrderItem" ("id", "orderId", "description", "quantity", "unitPricePyg", "totalPyg", "promotionSnapshot")
    VALUES (${`${TENANT}-promo-item`}, ${promoOrder}, 'Cupón de consistencia', 2, 0, 0, ${JSON.stringify({ id: `${TENANT}-promo`, code: 'CONSIST' })}::jsonb)`
  run(false, { expect: 1 })
  checks += 1
  console.log('ok · promociones: un usedUnits por debajo del consumo hace fallar el chequeo')
  run(true, { expect: 0 })
  const promo = await prisma.$queryRaw`SELECT "usedUnits" FROM "Promotion" WHERE "id" = ${`${TENANT}-promo`}`
  ok(Number(promo[0]?.usedUnits) === 2, 'promociones: --fix sube usedUnits al consumo real')

  // --- garantías: caso apuntando a una venta de otra empresa ---
  const otherOrder = `${OTHER_TENANT}-order`
  await seedOrder(otherOrder, OTHER_TENANT, OTHER_USER, `CONSIST-WARRANTY-${stamp}`, 'COMPLETED', 0)
  await prisma.$executeRaw`
    INSERT INTO "OrderItem" ("id", "orderId", "description", "quantity", "unitPricePyg", "totalPyg")
    VALUES (${`${OTHER_TENANT}-item`}, ${otherOrder}, 'Equipo de otra empresa', 1, 0, 0)`
  await prisma.$executeRaw`
    INSERT INTO "WarrantyCase" ("id", "tenantId", "branchId", "orderItemId", "customerName", "serial", "description", "kind", "status", "updatedAt")
    VALUES (${`${TENANT}-warranty`}, ${TENANT}, ${BRANCH}, ${`${OTHER_TENANT}-item`}, 'Cliente Consistencia', 'SERIAL-CRUZADO', 'Caso cruzado', 'SERVICE', 'RECEIVED', CURRENT_TIMESTAMP)`
  run(false, { expect: 1 })
  checks += 1
  console.log('ok · garantías: un caso con venta de otra empresa hace fallar el chequeo')
  await prisma.$executeRaw`DELETE FROM "WarrantyCase" WHERE "id" = ${`${TENANT}-warranty`}`

  // --- cierre: limpieza y verde final ---
  await prisma.$executeRaw`DELETE FROM "WarrantyCase" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
  await prisma.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT}))`
  await prisma.$executeRaw`DELETE FROM "Order" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
  await prisma.$executeRaw`DELETE FROM "CashSession" WHERE "tenantId" = ${TENANT}`
  await prisma.$executeRaw`DELETE FROM "Promotion" WHERE "tenantId" = ${TENANT}`
  await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`
  run(false, { expect: 0 })
  checks += 1
  console.log('ok · tras limpiar los escenarios la base vuelve a dar verde')

  console.log(`consistency-selftest: ${checks} verificación(es) OK.`)
}

try {
  await main()
} catch (error) {
  console.error(error?.message || error)
  process.exitCode = 1
} finally {
  await cleanup()
}
