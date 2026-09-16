import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { ensureStoreBranch } from '../../../lib/store-branch'

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA']
type QueryDb = Pick<typeof prisma, '$queryRaw'> | Pick<Prisma.TransactionClient, '$queryRaw'>
const int = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647
const note = (value: unknown) => value == null ? null : typeof value === 'string' && value.trim().length <= 500 ? value.trim() || null : undefined
const movementKinds = ['EXPENSE', 'TRANSFER', 'SUPPLIER_ADVANCE', 'CHEQUE', 'OWNER_WITHDRAWAL', 'ADJUSTMENT'] as const
const currencies = ['PYG', 'USD', 'BRL', 'EUR', 'USDT'] as const

async function context(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: 401 as const }
  if (!ROLES.includes(session.user.role)) return { error: 403 as const }
  const requested = new URL(request.url).searchParams.get('branchId')
  let branchId: string | null = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId) branchId = await ensureStoreBranch(session)
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
  const movements = await prisma.cashMovement.findMany({ where: { tenantId: ctx.session.user.tenantId, ...(ctx.session.user.role === 'ADMIN' ? {} : { branchId: ctx.branchId }) }, orderBy: { createdAt: 'desc' }, take: 100, include: { account: { select: { id: true, name: true, currency: true } } } })
  return json({ ...row[0], movements })
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
  if (action === 'movement') {
    const kind = body.kind; const direction = body.direction; const currency = body.currency ?? 'PYG'
    const originalAmount = Number(body.originalAmount); const exchangeRatePyg = Number(body.exchangeRatePyg ?? 1)
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const counterparty = body.counterparty == null || body.counterparty === '' ? null : typeof body.counterparty === 'string' && body.counterparty.trim().length <= 200 ? body.counterparty.trim() : undefined
    const reference = body.reference == null || body.reference === '' ? null : typeof body.reference === 'string' && body.reference.trim().length <= 200 ? body.reference.trim() : undefined
    const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
    if (!movementKinds.includes(kind) || !['IN', 'OUT'].includes(direction) || !currencies.includes(currency) || !Number.isFinite(originalAmount) || originalAmount <= 0 || !Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0 || (currency === 'PYG' && exchangeRatePyg !== 1) || !description || description.length > 500 || counterparty === undefined || reference === undefined || (dueAt && !Number.isFinite(dueAt.getTime()))) return error('Movimiento financiero inválido.')
    const amountPyg = Math.round(originalAmount * exchangeRatePyg); if (!int(amountPyg) || amountPyg === 0) return error('Monto convertido fuera de rango.')
    const accountId = body.accountId == null || body.accountId === '' ? null : typeof body.accountId === 'string' ? body.accountId : undefined
    if (accountId === undefined) return error('Cuenta inválida.')
    try {
      const movement = await prisma.$transaction(async tx => {
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true } })
          if (!account || account.currency !== currency) throw new Error('Cuenta no válida para la moneda indicada.')
        }
        const created = await tx.cashMovement.create({ data: { tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, accountId, createdById: ctx.session.user.id, kind, direction, currency, originalAmount: String(originalAmount), exchangeRatePyg: String(exchangeRatePyg), amountPyg, counterparty, reference, description, dueAt, status: kind === 'CHEQUE' ? 'PENDING' : 'CLEARED', clearedAt: kind === 'CHEQUE' ? null : new Date() }, include: { account: { select: { id: true, name: true, currency: true } } } })
        await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'CASH_MOVEMENT_RECORDED', entity: 'CashMovement', entityId: created.id, metadata: { kind, direction, currency, originalAmount, exchangeRatePyg, amountPyg, accountId } } })
        return created
      })
      return json(movement, { status: 201 })
    } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar el movimiento.', 409) }
  }
  if (action === 'clear-movement') {
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return error('Movimiento obligatorio.')
    const updated = await prisma.cashMovement.updateMany({ where: { id, tenantId: ctx.session.user.tenantId, ...(ctx.session.user.role === 'ADMIN' ? {} : { branchId: ctx.branchId }), status: 'PENDING' }, data: { status: 'CLEARED', clearedAt: new Date() } })
    if (!updated.count) return error('Movimiento pendiente no encontrado.', 404)
    await prisma.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'CASH_MOVEMENT_CLEARED', entity: 'CashMovement', entityId: id, metadata: {} } })
    return json({ id, status: 'CLEARED' })
  }
  return error('Acción de caja inválida.')
}
