import { Prisma } from '@prisma/client'
import type { prisma } from './prisma'
import { LIMITE_MONTO_GENERAL } from './montos'
import { sqlDrawer } from './payment-net'
import type { PorMoneda } from './cash-expected-pure'
export { esperadoCaja, esperadoPorMoneda, vueltoPyg } from './cash-expected-pure'
export type { PorMoneda } from './cash-expected-pure'

// Efectivo esperado en caja: UNA sola definición para el cierre de turno, la
// pantalla de Caja y la auditoría de efectivo (#461).
//   esperado = apertura + cobros en efectivo + ingresos de caja − egresos de caja
// Esta función devuelve la parte móvil con signo (cobros − reembolsos en efectivo ± movimientos)
// del período [openedAt, until]; quien la llama le suma la apertura con `esperadoCaja`. Cada moneda
// se cuenta aparte (`cashExpectedByCurrency`): un cobro en USD suma lo realmente entregado en dólares
// y el vuelto sale como egreso en guaraníes (#455).
type QueryDb = Pick<typeof prisma, '$queryRaw'> | Pick<Prisma.TransactionClient, '$queryRaw'>

const redondear = (moneda: string, valor: number) => (moneda === 'PYG' ? Math.round(valor) : Math.round(valor * 100) / 100)

/**
 * Parte móvil (cobros − reembolsos ± movimientos) POR MONEDA del período [openedAt, until].
 *  - Cobro en efectivo: lo realmente entregado (`tenderedAmount`) o, si no hubo vuelto, lo aplicado.
 *  - Reembolso: resta en su moneda (guaraníes). Reversión de una corrección (#393): resta lo aplicado.
 *  - Movimientos de caja CLEARED (incluye el «Vuelto»): suman/restan en su moneda.
 */
export async function cashExpectedByCurrency(db: QueryDb, tenantId: string, branchId: string, openedAt: Date, until = new Date(), userId?: string): Promise<PorMoneda> {
  const rows = await db.$queryRaw<Array<{ cur: string; total: string }>>`
    SELECT COALESCE(p."currency"::text, 'PYG') AS cur,
      COALESCE(SUM(CASE
        WHEN p."status" = 'REFUNDED' THEN -(CASE WHEN COALESCE(p."currency"::text, 'PYG') = 'PYG' THEN p."amountPyg"::numeric ELSE COALESCE(p."originalAmount", 0) END)
        WHEN COALESCE(p."currency"::text, 'PYG') = 'PYG' THEN COALESCE(p."tenderedAmount", p."amountPyg"::numeric)
        WHEN p."reversalOfId" IS NOT NULL THEN -ABS(COALESCE(p."originalAmount", 0))
        ELSE COALESCE(p."tenderedAmount", p."originalAmount", 0)
      END), 0)::text AS total
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
    WHERE p."tenantId" = ${tenantId} AND p."method" = 'CASH' AND p."status" IN ('CONFIRMED', 'REFUNDED')
      AND ${sqlDrawer('p')}
      AND o."tenantId" = ${tenantId} AND o."branchId" = ${branchId}
      AND p."paidAt" >= ${openedAt} AND p."paidAt" <= ${until}
      ${userId ? Prisma.sql`AND (p."userId" = ${userId} OR p."createdById" = ${userId})` : Prisma.empty}
    GROUP BY 1`
  const porMoneda: PorMoneda = {}
  for (const row of rows) {
    const total = Number(row.total)
    if (!Number.isFinite(total) || Math.abs(total) > LIMITE_MONTO_GENERAL) throw new Error('El total de efectivo excede el rango permitido.')
    porMoneda[row.cur] = (porMoneda[row.cur] ?? 0) + total
  }
  // Movimientos de caja del turno (gastos, retiros, adelantos, vuelto): solo cuando ya están cobrados/pagados.
  const movementRows = await db.$queryRaw<Array<{ cur: string; total: string }>>`
    SELECT m."currency"::text AS cur,
      COALESCE(SUM((CASE WHEN m."direction" = 'IN' THEN 1 ELSE -1 END) * (CASE WHEN m."currency"::text = 'PYG' THEN m."amountPyg"::numeric ELSE m."originalAmount" END)), 0)::text AS total
    FROM "CashMovement" m
    WHERE m."tenantId" = ${tenantId} AND m."branchId" = ${branchId}
      AND m."status" = 'CLEARED'
      AND (m."accountId" IS NULL OR EXISTS (SELECT 1 FROM "PaymentAccount" a WHERE a."id" = m."accountId" AND a."kind" = 'CASH'))
      AND m."createdAt" >= ${openedAt} AND m."createdAt" <= ${until}
      ${userId ? Prisma.sql`AND m."createdById" = ${userId}` : Prisma.empty}
    GROUP BY 1`
  for (const row of movementRows) {
    const total = Number(row.total)
    if (!Number.isFinite(total)) throw new Error('El total de movimientos excede el rango permitido.')
    porMoneda[row.cur] = (porMoneda[row.cur] ?? 0) + total
  }
  for (const moneda of Object.keys(porMoneda)) porMoneda[moneda] = redondear(moneda, porMoneda[moneda])
  if (!Number.isSafeInteger(porMoneda.PYG ?? 0)) throw new Error('El total de movimientos excede el rango permitido.')
  return porMoneda
}

// Neto en guaraníes con signo; las demás monedas se cuentan con cashExpectedByCurrency.
// Un retiro mayor a los cobros da negativo y NO se recorta antes de sumar la apertura
// (apertura 500.000 − retiro 200.000 = 300.000, no 500.000).
export async function cashExpectedBetween(db: QueryDb, tenantId: string, branchId: string, openedAt: Date, until = new Date(), userId?: string) {
  const porMoneda = await cashExpectedByCurrency(db, tenantId, branchId, openedAt, until, userId)
  return porMoneda.PYG ?? 0
}
