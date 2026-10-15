import { Prisma } from '@prisma/client'
import { countFlags, countablePayments, signedOriginalAmount, sumConfirmed, netPaid, PAYMENT_NET_FIELDS } from './payment-net-pure'

export { countFlags, countablePayments, signedOriginalAmount, sumConfirmed, netPaid, PAYMENT_NET_FIELDS }

// Neteo de correcciones de pago (#393). Una corrección deja el pago original
// intacto, agrega una reversión (Payment.reversalOfId, amountPyg NEGATIVO y
// originalAmount positivo por el CHECK Payment_account_snapshot_check) y pagos
// nuevos. Reglas para quien suma o cuenta pagos CONFIRMED:
//  - Sumas: usar siempre el signo de amountPyg (Σ original + reversión = 0).
//  - Conteos: no cuentan las reversiones ni los originales revertidos (el par
//    sale; queda el pago nuevo).
//  - Cajón de efectivo: los pagos de una corrección con drawerImpact=false
//    (turno de origen ya cerrado) no tocan el esperado ni el cierre guardado;
//    se muestran aparte como «Ajustes por corrección».

/** Prisma where: pagos que cuentan (sin reversiones ni revertidos). */
export const COUNTABLE_PAYMENT_WHERE: Prisma.PaymentWhereInput = { reversalOfId: null, reversal: { is: null } }

/** Prisma where: pagos que tocan el cajón (excluye correcciones con drawerImpact=false). */
export const DRAWER_PAYMENT_WHERE: Prisma.PaymentWhereInput = { OR: [{ correctionId: null }, { correction: { is: { drawerImpact: true } } }] }

/** SQL: la fila `alias` no es reversión ni fue revertida. */
export const sqlCountable = (alias = 'p') => Prisma.raw(`${alias}."reversalOfId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Payment" rv WHERE rv."reversalOfId" = ${alias}."id")`)

/**
 * SQL de conteo para la auditoría del cajón: una corrección sin impacto en caja
 * (turno cerrado) deja el original en su lugar y saca reversión y pagos nuevos
 * (con sqlDrawer); por eso el original solo deja de contar si lo revirtió una
 * corrección con impacto en caja.
 */
export const sqlCountableDrawer = (alias = 'p') => Prisma.raw(`${alias}."reversalOfId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Payment" rv LEFT JOIN "PaymentCorrection" rc ON rc."id" = rv."correctionId" WHERE rv."reversalOfId" = ${alias}."id" AND COALESCE(rc."drawerImpact", true))`)

/** SQL: la fila `alias` cuenta para el efectivo del turno (no es de una corrección sin impacto en caja). */
export const sqlDrawer = (alias = 'p') => Prisma.raw(`NOT EXISTS (SELECT 1 FROM "PaymentCorrection" pcx WHERE pcx."id" = ${alias}."correctionId" AND pcx."drawerImpact" = false)`)

type QueryDb = Pick<Prisma.TransactionClient, '$queryRaw'>

export type DayCorrection = {
  id: string; orderId: string; orderNumber: string | null; reason: string; createdAt: Date
  originSessionClosed: boolean; drawerImpact: boolean; cashDeltaPyg: number; before: unknown; after: unknown
}

/**
 * Ajustes por corrección del período: correcciones de la sucursal cuyo efecto
 * en efectivo NO se aplicó al cajón (drawerImpact=false). cashDeltaPyg es el
 * efectivo que la corrección saca (<0) o mete (>0) respecto del pago original;
 * sirve para conciliar contra el cierre ya guardado sin modificarlo.
 */
export async function dayCorrections(db: QueryDb, tenantId: string, branchId: string, start: Date, end: Date) {
  const rows = await db.$queryRaw<Array<{ id: string; orderId: string; orderNumber: string | null; reason: string; createdAt: Date; originSessionClosed: boolean; drawerImpact: boolean; before: unknown; after: unknown; cash: bigint | null }>>`
    SELECT c."id", c."orderId", o."orderNumber", c."reason", c."createdAt", c."originSessionClosed", c."drawerImpact", c."before", c."after",
           (SELECT COALESCE(SUM(p."amountPyg"), 0)::bigint FROM "Payment" p
             WHERE p."correctionId" = c."id" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED') AS "cash"
    FROM "PaymentCorrection" c JOIN "Order" o ON o."id" = c."orderId"
    WHERE c."tenantId" = ${tenantId} AND o."branchId" = ${branchId} AND c."drawerImpact" = false
      AND c."createdAt" >= ${start} AND c."createdAt" < ${end}
    ORDER BY c."createdAt" DESC LIMIT 200`
  const items: DayCorrection[] = rows.map((row) => ({
    id: row.id, orderId: row.orderId, orderNumber: row.orderNumber, reason: row.reason, createdAt: row.createdAt,
    originSessionClosed: row.originSessionClosed, drawerImpact: row.drawerImpact, cashDeltaPyg: Number(row.cash ?? 0n), before: row.before, after: row.after,
  }))
  // Totales del período completo en SQL: la lista se corta en 200 filas, los totales no.
  const totales = await db.$queryRaw<Array<{ count: bigint; cash: bigint | null }>>`
    SELECT COUNT(*)::bigint AS "count",
           COALESCE(SUM((SELECT COALESCE(SUM(p."amountPyg"), 0) FROM "Payment" p
             WHERE p."correctionId" = c."id" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED')), 0)::bigint AS "cash"
    FROM "PaymentCorrection" c JOIN "Order" o ON o."id" = c."orderId"
    WHERE c."tenantId" = ${tenantId} AND o."branchId" = ${branchId} AND c."drawerImpact" = false
      AND c."createdAt" >= ${start} AND c."createdAt" < ${end}`
  return { count: Number(totales[0]?.count ?? 0n), cashDeltaPyg: Number(totales[0]?.cash ?? 0n), items }
}
