import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'
import { ensureStoreBranch } from '../../../../lib/store-branch'

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA']
const METHODS = ['CASH', 'TRANSFER', 'CARD', 'PIX', 'CRYPTO', 'CREDIT', 'TRADE_IN'] as const
// Paraguay usa UTC-4: el "día" operativo de la sucursal se delimita así.
const OFFSET = '-04:00'

// Control de cierre por método de pago: cuánto entró en efectivo, por
// transferencia, tarjeta o PIX en la sucursal y el día indicados, para
// contrastar con el conteo físico al auditar.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!ROLES.includes(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const requested = params.get('branchId')
  let branchId: string | null = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId) branchId = await ensureStoreBranch(session)
  if (!branchId) return error('Sucursal no encontrada.', 403)
  const dateParam = params.get('date') || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return error('Fecha inválida. Usá YYYY-MM-DD.', 400)
  const start = new Date(`${dateParam}T00:00:00${OFFSET}`)
  const endDay = new Date(`${dateParam}T00:00:00${OFFSET}`)
  endDay.setDate(endDay.getDate() + 1)
  if (Number.isNaN(start.getTime())) return error('Fecha inválida. Usá YYYY-MM-DD.', 400)
  const rows: Array<{ method: string; status: string; total: bigint; count: bigint }> = await prisma.$queryRaw`
    SELECT p."method"::text AS method, p."status"::text AS status, COALESCE(SUM(p."amountPyg"), 0)::bigint AS total, COUNT(*)::bigint AS count
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" AND o."tenantId" = p."tenantId"
    WHERE p."tenantId" = ${tenant} AND o."branchId" = ${branchId}
      AND p."paidAt" >= ${start} AND p."paidAt" < ${endDay}
    GROUP BY p."method", p."status"`
  const methods = METHODS.map(method => {
    const entries = rows.filter(row => row.method === method)
    const confirmed = entries.find(row => row.status === 'CONFIRMED')
    const pending = entries.find(row => row.status === 'PENDING')
    const refunded = entries.find(row => row.status === 'REJECTED') || entries.find(row => row.status === 'REFUNDED')
    return {
      method,
      amountPyg: Number(confirmed?.total || 0n),
      count: Number(confirmed?.count || 0n),
      pendingAmountPyg: Number(pending?.total || 0n),
      refundedAmountPyg: Number(refunded?.total || 0n),
    }
  })
  const totals = {
    amountPyg: methods.reduce((sum, row) => sum + row.amountPyg, 0),
    count: methods.reduce((sum, row) => sum + row.count, 0),
  }
  return json({ date: dateParam, branchId, window: { start: start.toISOString(), end: endDay.toISOString(), offset: OFFSET }, methods, totals })
}
