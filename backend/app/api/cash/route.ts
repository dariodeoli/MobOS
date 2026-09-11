import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA']
type QueryDb = Pick<typeof prisma, '$queryRaw'> | Pick<Prisma.TransactionClient, '$queryRaw'>
const int = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647
const note = (value: unknown) => value == null ? null : typeof value === 'string' && value.trim().length <= 500 ? value.trim() || null : undefined

async function context(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: 401 as const }
  if (!ROLES.includes(session.user.role)) return { error: 403 as const }
  const requested = new URL(request.url).searchParams.get('branchId')
  const branchId = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId) return { error: 403 as const }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
  return branch ? { session, branchId } : { error: 403 as const }
}

async function expected(db: QueryDb, tenantId: string, branchId: string, openedAt: Date, until = new Date()) {
  const rows = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(p."amountPyg"), 0)::bigint AS total
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
    WHERE p."tenantId" = ${tenantId} AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
      AND COALESCE(p."currency"::text, 'PYG') = 'PYG'
      AND o."tenantId" = ${tenantId} AND o."branchId" = ${branchId}
      AND p."paidAt" >= ${openedAt} AND p."paidAt" <= ${until}`
  const total = Number(rows[0]?.total || 0n)
  if (!int(total)) throw new Error('El total de efectivo excede el rango permitido.')
  return total
}

export async function GET(request: Request) {
  const ctx = await context(request); if ('error' in ctx) return error(ctx.error === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.error)
  const row = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "CashSession" WHERE "tenantId" = ${ctx.session.user.tenantId} AND "branchId" = ${ctx.branchId} ORDER BY "openedAt" DESC LIMIT 1`
  if (!row[0]) return json(null)
  if (row[0].status === 'OPEN') {
    const expectedPyg = Number(row[0].openingPyg) + await expected(prisma, ctx.session.user.tenantId, ctx.branchId, new Date(String(row[0].openedAt)))
    if (!int(expectedPyg)) return error('El total esperado excede el rango permitido.', 422)
    row[0].expectedPyg = expectedPyg
  }
  return json(row[0])
}

export async function POST(request: Request) {
  const ctx = await context(request); if ('error' in ctx) return error(ctx.error === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.error)
  const body = await request.json(); const action = body.action
  const notes = note(body.notes); if (notes === undefined) return error('Las notas deben ser texto de hasta 500 caracteres.')
  if (action === 'open') {
    const openingPyg = Number(body.openingPyg); if (!int(openingPyg)) return error('El fondo inicial debe ser un entero no negativo.')
    try {
      const result = await prisma.$transaction(async (tx) => {
        const id = randomUUID()
        const row = await tx.$queryRaw<Array<Record<string, unknown>>>`
          INSERT INTO "CashSession" ("id", "tenantId", "branchId", "openedById", "openingPyg", "status", "notes")
          VALUES (${id}, ${ctx.session.user.tenantId}, ${ctx.branchId}, ${ctx.session.user.id}, ${openingPyg}, 'OPEN', ${notes}) RETURNING *`
        await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${ctx.session.user.tenantId}, ${ctx.session.user.id}, 'CASH_OPENED', 'CashSession', ${id}, ${JSON.stringify({ branchId: ctx.branchId, openingPyg })}::jsonb)`
        return row[0]
      })
      return json(result, { status: 201 })
    } catch { return error('Ya existe una caja abierta para esta sucursal.', 409) }
  }
  if (action === 'close') {
    const countedPyg = Number(body.countedPyg); if (!int(countedPyg)) return error('El efectivo contado debe ser un entero no negativo.')
    const result = await prisma.$transaction(async (tx) => {
      const open = await tx.$queryRaw<Array<{ id: string; openedAt: Date; openingPyg: number }>>`SELECT "id", "openedAt", "openingPyg" FROM "CashSession" WHERE "tenantId" = ${ctx.session.user.tenantId} AND "branchId" = ${ctx.branchId} AND "status" = 'OPEN' FOR UPDATE`
      if (!open[0]) return null
      const expectedPyg = Number(open[0].openingPyg) + await expected(tx, ctx.session.user.tenantId, ctx.branchId, open[0].openedAt)
      if (!int(expectedPyg)) throw new Error('El total esperado excede el rango permitido.')
      const row = await tx.$queryRaw<Array<Record<string, unknown>>>`UPDATE "CashSession" SET "closedById" = ${ctx.session.user.id}, "closedAt" = CURRENT_TIMESTAMP, "countedPyg" = ${countedPyg}, "expectedPyg" = ${expectedPyg}, "status" = 'CLOSED', "notes" = ${notes} WHERE "id" = ${open[0].id} RETURNING *`
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${ctx.session.user.tenantId}, ${ctx.session.user.id}, 'CASH_CLOSED', 'CashSession', ${open[0].id}, ${JSON.stringify({ branchId: ctx.branchId, countedPyg, expectedPyg, differencePyg: countedPyg - expectedPyg })}::jsonb)`
      return { row: row[0], expectedPyg }
    })
    if (!result) return error('No hay una caja abierta para esta sucursal.', 409)
    return json({ ...result.row, differencePyg: countedPyg - result.expectedPyg })
  }
  return error('Acción de caja inválida.')
}
