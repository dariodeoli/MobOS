import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'

// Control de créditos: pendiente por cliente, límite, uso y días de mora.
// Los roles de administración y caja lo usan como pantalla de compliance.
// La lista se corta en 200 clientes (los más morosos), pero los **totales** se
// calculan aparte sobre todos los deudores: un tope de lista no puede cambiar
// el número de control.
const MAX_CLIENTES = 200
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'CAJERA'].includes(session.user.role)) return error('No autorizado.', 403)
  const branchId = session.user.branchId || new URL(request.url).searchParams.get('branchId') || null
  const porCliente = Prisma.sql`
    SELECT c."id" AS "customerId", c."name", c."phone", c."document", c."pricingTier"::text, c."creditLimitPyg", c."creditDays",
      COUNT(o."id")::int AS "pendingOrders",
      COALESCE(SUM(o."totalPyg" - COALESCE(p.confirmed, 0)), 0)::bigint AS "outstandingPyg",
      MIN(o."dueAt") AS "oldestDueAt",
      COUNT(o."id") FILTER (WHERE o."dueAt" IS NOT NULL AND o."dueAt" < now())::int AS "overdueOrders",
      COALESCE(SUM(CASE WHEN o."dueAt" IS NOT NULL AND o."dueAt" < now() THEN o."totalPyg" - COALESCE(p.confirmed, 0) ELSE 0 END), 0)::bigint AS "overduePyg",
      MAX(CASE WHEN o."dueAt" IS NOT NULL AND o."dueAt" < now() THEN GREATEST(EXTRACT(EPOCH FROM (now() - o."dueAt")) / 86400, 0) ELSE NULL END)::int AS "maxOverdueDays",
      COALESCE(SUM(CASE WHEN o."dueAt" IS NOT NULL AND o."dueAt" >= now() AND o."dueAt" < now() + interval '7 days' THEN o."totalPyg" - COALESCE(p.confirmed, 0) ELSE 0 END), 0)::bigint AS "dueSoonPyg",
      COUNT(o."id") FILTER (WHERE o."dueAt" IS NOT NULL AND o."dueAt" >= now() AND o."dueAt" < now() + interval '7 days')::int AS "dueSoonOrders"
    FROM "Customer" c
    JOIN "Order" o ON o."customerId" = c."id" AND o."tenantId" = c."tenantId" AND o."status" = 'PENDING'
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${tenant} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
    WHERE c."tenantId" = ${tenant} AND (${branchId}::text IS NULL OR o."branchId" = ${branchId})
    GROUP BY c."id"`
  type FilaCredito = { customerId: string; name: string; phone: string | null; document: string | null; pricingTier: string; creditLimitPyg: number | null; creditDays: number | null; pendingOrders: number; outstandingPyg: bigint; oldestDueAt: Date | null; overdueOrders: number; overduePyg: bigint; maxOverdueDays: number | null; dueSoonPyg: bigint; dueSoonOrders: number }
  const [rows, resumen] = await Promise.all([
    prisma.$queryRaw<FilaCredito[]>`${porCliente} ORDER BY "overduePyg" DESC, "outstandingPyg" DESC LIMIT ${MAX_CLIENTES}`,
    prisma.$queryRaw<Array<{ customersWithDebt: number; outstandingPyg: bigint; overdueCustomers: number; overduePyg: bigint; dueSoonCustomers: number; dueSoonPyg: bigint }>>`SELECT
      COUNT(*) FILTER (WHERE t."outstandingPyg" > 0)::int AS "customersWithDebt",
      COALESCE(SUM(t."outstandingPyg"), 0)::bigint AS "outstandingPyg",
      COUNT(*) FILTER (WHERE t."overduePyg" > 0)::int AS "overdueCustomers",
      COALESCE(SUM(t."overduePyg"), 0)::bigint AS "overduePyg",
      COUNT(*) FILTER (WHERE t."dueSoonPyg" > 0)::int AS "dueSoonCustomers",
      COALESCE(SUM(t."dueSoonPyg"), 0)::bigint AS "dueSoonPyg"
      FROM (${porCliente}) t`,
  ])
  const credits = rows.map(row => ({
    customerId: row.customerId, name: row.name, phone: row.phone, document: row.document,
    pricingTier: row.pricingTier, creditLimitPyg: row.creditLimitPyg, creditDays: row.creditDays,
    pendingOrders: row.pendingOrders, outstandingPyg: Number(row.outstandingPyg),
    oldestDueAt: row.oldestDueAt, overdueOrders: row.overdueOrders,
    overduePyg: Number(row.overduePyg), maxOverdueDays: row.maxOverdueDays,
    dueSoonPyg: Number(row.dueSoonPyg), dueSoonOrders: row.dueSoonOrders,
    limitUsagePct: row.creditLimitPyg ? Math.min(100, Math.round((Number(row.outstandingPyg) / row.creditLimitPyg) * 100)) : null,
  }))
  const totales = resumen[0] || { customersWithDebt: 0, outstandingPyg: 0n, overdueCustomers: 0, overduePyg: 0n, dueSoonCustomers: 0, dueSoonPyg: 0n }
  const totals = {
    outstandingPyg: Number(totales.outstandingPyg),
    overduePyg: Number(totales.overduePyg),
    customersWithDebt: Number(totales.customersWithDebt),
    overdueCustomers: Number(totales.overdueCustomers),
    dueSoonPyg: Number(totales.dueSoonPyg),
    dueSoonCustomers: Number(totales.dueSoonCustomers),
  }
  return json({ credits, totals, truncado: rows.length >= MAX_CLIENTES })
}
