import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'

// Control de créditos: pendiente por cliente, límite, uso y días de mora.
// Los roles de administración y caja lo usan como pantalla de compliance.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'CAJERA'].includes(session.user.role)) return error('No autorizado.', 403)
  const branchId = session.user.branchId || new URL(request.url).searchParams.get('branchId') || null
  const rows = await prisma.$queryRaw<Array<{ customerId: string; name: string; phone: string | null; document: string | null; pricingTier: string; creditLimitPyg: number | null; creditDays: number | null; pendingOrders: number; outstandingPyg: bigint; oldestDueAt: Date | null; overdueOrders: number; overduePyg: bigint; maxOverdueDays: number | null }>>`
    SELECT c."id" AS "customerId", c."name", c."phone", c."document", c."pricingTier"::text, c."creditLimitPyg", c."creditDays",
      COUNT(o."id")::int AS "pendingOrders",
      COALESCE(SUM(o."totalPyg" - COALESCE(p.confirmed, 0)), 0)::bigint AS "outstandingPyg",
      MIN(o."dueAt") AS "oldestDueAt",
      COUNT(o."id") FILTER (WHERE o."dueAt" IS NOT NULL AND o."dueAt" < now())::int AS "overdueOrders",
      COALESCE(SUM(CASE WHEN o."dueAt" IS NOT NULL AND o."dueAt" < now() THEN o."totalPyg" - COALESCE(p.confirmed, 0) ELSE 0 END), 0)::bigint AS "overduePyg",
      MAX(CASE WHEN o."dueAt" IS NOT NULL AND o."dueAt" < now() THEN GREATEST(EXTRACT(EPOCH FROM (now() - o."dueAt")) / 86400, 0) ELSE NULL END)::int AS "maxOverdueDays"
    FROM "Customer" c
    JOIN "Order" o ON o."customerId" = c."id" AND o."tenantId" = c."tenantId" AND o."status" = 'PENDING'
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${tenant} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
    WHERE c."tenantId" = ${tenant} AND (${branchId}::text IS NULL OR o."branchId" = ${branchId})
    GROUP BY c."id"
    ORDER BY "overduePyg" DESC, "outstandingPyg" DESC
    LIMIT 200`
  const credits = rows.map(row => ({
    customerId: row.customerId, name: row.name, phone: row.phone, document: row.document,
    pricingTier: row.pricingTier, creditLimitPyg: row.creditLimitPyg, creditDays: row.creditDays,
    pendingOrders: row.pendingOrders, outstandingPyg: Number(row.outstandingPyg),
    oldestDueAt: row.oldestDueAt, overdueOrders: row.overdueOrders,
    overduePyg: Number(row.overduePyg), maxOverdueDays: row.maxOverdueDays,
    limitUsagePct: row.creditLimitPyg ? Math.min(100, Math.round((Number(row.outstandingPyg) / row.creditLimitPyg) * 100)) : null,
  }))
  const totals = {
    outstandingPyg: credits.reduce((sum, row) => sum + row.outstandingPyg, 0),
    overduePyg: credits.reduce((sum, row) => sum + row.overduePyg, 0),
    customersWithDebt: credits.filter(row => row.outstandingPyg > 0).length,
    overdueCustomers: credits.filter(row => row.overduePyg > 0).length,
  }
  return json({ credits, totals })
}
