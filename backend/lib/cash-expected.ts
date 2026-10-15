import { Prisma } from '@prisma/client'
import type { prisma } from './prisma'
import { LIMITE_MONTO_GENERAL } from './montos'
import { sqlDrawer } from './payment-net'

// Efectivo esperado en caja: UNA sola definición para el cierre de turno, la
// pantalla de Caja y la auditoría de efectivo (#461).
//   esperado = apertura + cobros en efectivo (guaraníes) + ingresos de caja − egresos de caja
// Esta función devuelve la parte móvil (cobros + movimientos) del período
// [openedAt, until]; quien la llama le suma la apertura. Los dólares y demás
// monedas no entran en el esperado en guaraníes: se cuentan aparte.
type QueryDb = Pick<typeof prisma, '$queryRaw'> | Pick<Prisma.TransactionClient, '$queryRaw'>
const int = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= LIMITE_MONTO_GENERAL

export async function cashExpectedBetween(db: QueryDb, tenantId: string, branchId: string, openedAt: Date, until = new Date(), userId?: string) {
  const rows = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(p."amountPyg"), 0)::bigint AS total
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
    WHERE p."tenantId" = ${tenantId} AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
      AND ${sqlDrawer('p')}
      AND COALESCE(p."currency"::text, 'PYG') = 'PYG'
      AND o."tenantId" = ${tenantId} AND o."branchId" = ${branchId}
      AND p."paidAt" >= ${openedAt} AND p."paidAt" <= ${until}
      ${userId ? Prisma.sql`AND (p."userId" = ${userId} OR p."createdById" = ${userId})` : Prisma.empty}`
  const total = Number(rows[0]?.total || 0n)
  if (!int(total)) throw new Error('El total de efectivo excede el rango permitido.')
  // Movimientos de caja del turno (gastos, retiros, adelantos): suman o restan
  // del efectivo esperado solo cuando ya están cobrados/pagados.
  const movementRows = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(CASE WHEN m."direction" = 'IN' THEN m."amountPyg" ELSE -m."amountPyg" END), 0)::bigint AS total
    FROM "CashMovement" m
    WHERE m."tenantId" = ${tenantId} AND m."branchId" = ${branchId}
      AND COALESCE(m."currency"::text, 'PYG') = 'PYG' AND m."status" = 'CLEARED'
      AND (m."accountId" IS NULL OR EXISTS (SELECT 1 FROM "PaymentAccount" a WHERE a."id" = m."accountId" AND a."kind" = 'CASH'))
      AND m."createdAt" >= ${openedAt} AND m."createdAt" <= ${until}
      ${userId ? Prisma.sql`AND m."createdById" = ${userId}` : Prisma.empty}`
  const movements = Number(movementRows[0]?.total || 0n)
  if (!Number.isSafeInteger(movements)) throw new Error('El total de movimientos excede el rango permitido.')
  return Math.max(0, total + movements)
}

