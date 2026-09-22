import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { ensureStoreBranch } from '../../../lib/store-branch'
import { CASH_MOVEMENT_KINDS, createCashMovement } from '../../../lib/cash-movements'
import { FINANCE_CURRENCIES, frozenAmountPyg } from '../../../lib/finance'

type QueryDb = Pick<typeof prisma, '$queryRaw'> | Pick<Prisma.TransactionClient, '$queryRaw'>
const int = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647
const note = (value: unknown) => value == null ? null : typeof value === 'string' && value.trim().length <= 500 ? value.trim() || null : undefined

async function context(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: 401 as const }
  if (!canAccessAny(session.user, ['cash:manage', 'payments:manage'])) return { error: 403 as const }
  const requested = new URL(request.url).searchParams.get('branchId')
  let branchId: string | null = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId) branchId = await ensureStoreBranch(session)
  if (!branchId) return { error: 403 as const }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
  return branch ? { session, branchId } : { error: 403 as const }
}

// Denominaciones válidas del arqueo en guaraníes (billetes y monedas).
const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50]

// Arqueo por denominación: devuelve el mapa limpio y el total contado, o
// `null` si no vino, o `undefined` si es inválido.
function countedBreakdownInput(value: unknown): { breakdown: Record<string, number> | null; countedPyg: number } | undefined {
  if (value === null || value === undefined || value === '') return { breakdown: null, countedPyg: 0 }
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length || entries.length > DENOMINACIONES.length) return undefined
  const breakdown: Record<string, number> = {}
  let total = 0
  for (const [key, raw] of entries) {
    const denom = Number(key); const count = Number(raw)
    if (!DENOMINACIONES.includes(denom) || !Number.isInteger(count) || count < 0 || count > 1000000) return undefined
    if (count > 0) { breakdown[String(denom)] = count; total += denom * count }
    if (total > 2147483647) return undefined
  }
  return { breakdown, countedPyg: total }
}

async function expected(db: QueryDb, tenantId: string, branchId: string, openedAt: Date, until = new Date(), userId?: string) {
  const rows = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(p."amountPyg"), 0)::bigint AS total
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
    WHERE p."tenantId" = ${tenantId} AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
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

// Rango de sesiones del panel «Ventas por caja» (#148 §18): fechas locales de
// Paraguay (UTC-3), `from`/`to` como el resto de los endpoints de Finanzas.
const OFFSET_PY = '-03:00'
function rangoDeSesiones(params: URLSearchParams) {
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const hasta = params.get('to') || params.get('hasta') || hoy
  const desde = params.get('from') || params.get('desde') || new Date(Date.parse(`${hasta}T12:00:00${OFFSET_PY}`) - 29 * 86400000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null
  const start = new Date(`${desde}T00:00:00${OFFSET_PY}`)
  const end = new Date(`${hasta}T00:00:00${OFFSET_PY}`)
  end.setDate(end.getDate() + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
  if (end.getTime() - start.getTime() > 366 * 86400000) return null
  return { from: desde, to: hasta, start, end }
}

// Corte por sesión: efectivo y pedidos del turno (misma base que el esperado),
// más los movimientos de caja cobrados. El esperado de un turno cerrado es el
// que quedó auditado al cerrar; el del turno abierto se calcula en vivo.
async function sesionesResumen(tenant: string, branchId: string, start: Date, end: Date, ahora = new Date()) {
  const filas = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s."id", s."openedAt", s."closedAt", s."status", s."openingPyg", s."countedPyg", s."expectedPyg", s."notes",
           u."name" AS "openedByName",
           COALESCE(ef."efectivoPyg", 0)::bigint AS "efectivoPyg",
           COALESCE(ef."pagos", 0)::int AS "pagosEfectivo",
           COALESCE(ov."pedidos", 0)::int AS "pedidos",
           COALESCE(ov."ventasPyg", 0)::bigint AS "ventasPyg",
           COALESCE(mv."movimientosPyg", 0)::bigint AS "movimientosPyg"
    FROM "CashSession" s
    JOIN "User" u ON u."id" = s."openedById"
    LEFT JOIN LATERAL (
      SELECT SUM(p."amountPyg") AS "efectivoPyg", COUNT(*) AS "pagos"
      FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
      WHERE p."tenantId" = s."tenantId" AND p."method" = 'CASH' AND p."status" = 'CONFIRMED'
        AND COALESCE(p."currency"::text, 'PYG') = 'PYG'
        AND o."tenantId" = s."tenantId" AND o."branchId" = s."branchId"
        AND p."paidAt" >= s."openedAt" AND p."paidAt" < COALESCE(s."closedAt", ${ahora})
        AND (p."userId" = s."openedById" OR p."createdById" = s."openedById")
    ) ef ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "pedidos", SUM(o."totalPyg") AS "ventasPyg"
      FROM "Order" o
      WHERE o."tenantId" = s."tenantId" AND o."branchId" = s."branchId" AND o.status <> 'CANCELLED'
        AND o."createdAt" >= s."openedAt" AND o."createdAt" < COALESCE(s."closedAt", ${ahora})
        AND o."sellerId" = s."openedById"
    ) ov ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN m."direction" = 'IN' THEN m."amountPyg" ELSE -m."amountPyg" END) AS "movimientosPyg"
      FROM "CashMovement" m
      WHERE m."tenantId" = s."tenantId" AND m."branchId" = s."branchId"
        AND COALESCE(m."currency"::text, 'PYG') = 'PYG' AND m."status" = 'CLEARED'
        AND (m."accountId" IS NULL OR EXISTS (SELECT 1 FROM "PaymentAccount" a WHERE a."id" = m."accountId" AND a.kind = 'CASH'))
        AND m."createdAt" >= s."openedAt" AND m."createdAt" < COALESCE(s."closedAt", ${ahora})
        AND m."createdById" = s."openedById"
    ) mv ON TRUE
    WHERE s."tenantId" = ${tenant} AND s."branchId" = ${branchId}
      AND s."openedAt" >= ${start} AND s."openedAt" < ${end}
    ORDER BY s."openedAt" DESC
    LIMIT 100`
  return filas.map((fila) => {
    const openingPyg = Number(fila.openingPyg || 0)
    const efectivoPyg = Number(fila.efectivoPyg || 0)
    const movimientosPyg = Number(fila.movimientosPyg || 0)
    const abierta = String(fila.status) === 'OPEN'
    const esperadoPyg = abierta || fila.expectedPyg === null || fila.expectedPyg === undefined
      ? openingPyg + efectivoPyg + movimientosPyg
      : Number(fila.expectedPyg)
    const contadoPyg = fila.countedPyg === null || fila.countedPyg === undefined ? null : Number(fila.countedPyg)
    return {
      id: String(fila.id),
      openedByName: String(fila.openedByName || ''),
      openedAt: fila.openedAt,
      closedAt: fila.closedAt,
      status: String(fila.status),
      openingPyg,
      efectivoPyg,
      pagosEfectivo: Number(fila.pagosEfectivo || 0),
      movimientosPyg,
      pedidos: Number(fila.pedidos || 0),
      ventasPyg: Number(fila.ventasPyg || 0),
      esperadoPyg,
      contadoPyg,
      diferenciaPyg: contadoPyg === null ? null : contadoPyg - esperadoPyg,
      notes: fila.notes === null || fila.notes === undefined ? '' : String(fila.notes),
    }
  })
}

export async function GET(request: Request) {
  const ctx = await context(request); if ('error' in ctx) return error(ctx.error === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.error)
  const tenant = ctx.session.user.tenantId
  // Panel «Ventas por caja» (#148 §18): corte por sesión del período pedido.
  const params = new URL(request.url).searchParams
  if (['1', 'true'].includes((params.get('sesiones') || '').toLowerCase())) {
    const rango = rangoDeSesiones(params)
    if (!rango) return error('El rango de fechas es inválido.', 400)
    const sesiones = await sesionesResumen(tenant, ctx.branchId, rango.start, rango.end)
    return json({ sesiones, rango: { from: rango.from, to: rango.to, branchId: ctx.branchId } })
  }
  // El turno del usuario manda: si tiene una caja abierta se muestra esa; si
  // no, se muestra la última sesión (para consultar el último cierre).
  const mine = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "CashSession" WHERE "tenantId" = ${tenant} AND "branchId" = ${ctx.branchId} AND "openedById" = ${ctx.session.user.id} AND "status" = 'OPEN' ORDER BY "openedAt" DESC LIMIT 1`
  const row = mine[0] ? mine : await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "CashSession" WHERE "tenantId" = ${tenant} AND "branchId" = ${ctx.branchId} ORDER BY "openedAt" DESC LIMIT 1`
  const openSessions = await prisma.$queryRaw<Array<{ id: string; openedById: string; openedByName: string; openedAt: Date; openingPyg: number }>>`
    SELECT s."id", s."openedById", u."name" AS "openedByName", s."openedAt", s."openingPyg"
    FROM "CashSession" s JOIN "User" u ON u."id" = s."openedById"
    WHERE s."tenantId" = ${tenant} AND s."branchId" = ${ctx.branchId} AND s."status" = 'OPEN'
    ORDER BY s."openedAt" ASC`
  const movements = await prisma.cashMovement.findMany({ where: { tenantId: tenant, ...(ctx.session.user.role === 'ADMIN' ? {} : { branchId: ctx.branchId }) }, orderBy: { createdAt: 'desc' }, take: 100, include: { account: { select: { id: true, name: true, currency: true } } } })
  if (!row[0]) return json({ session: null, openSessions, movements })
  const session = row[0]
  if (session.status === 'OPEN') {
    const expectedPyg = Number(session.openingPyg) + await expected(prisma, tenant, ctx.branchId, new Date(String(session.openedAt)), new Date(), String(session.openedById))
    if (!int(expectedPyg)) return error('El total esperado excede el rango permitido.', 422)
    session.expectedPyg = expectedPyg
  }
  return json({ ...session, session, openSessions, movements })
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
        const openedAt = new Date()
        const row = await tx.$queryRaw<Array<Record<string, unknown>>>`
          INSERT INTO "CashSession" ("id", "tenantId", "branchId", "openedById", "openingPyg", "status", "notes", "openedAt")
          VALUES (${id}, ${ctx.session.user.tenantId}, ${ctx.branchId}, ${ctx.session.user.id}, ${openingPyg}, 'OPEN', ${notes}, ${openedAt}) RETURNING *`
        await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${ctx.session.user.tenantId}, ${ctx.session.user.id}, 'CASH_OPENED', 'CashSession', ${id}, ${JSON.stringify({ branchId: ctx.branchId, openingPyg, openedById: ctx.session.user.id })}::jsonb)`
        return row[0]
      })
      return json(result, { status: 201 })
    } catch { return error('Ya tenés un turno de caja abierto en esta sucursal.', 409) }
  }
  if (action === 'close') {
    const arqueo = countedBreakdownInput(body.countedBreakdown)
    if (!arqueo) return error('El arqueo por denominación es inválido.')
    // Con desglose por denominación el total contado se deriva del detalle; sin
    // él se mantiene el total manual de siempre.
    const countedPyg = arqueo.breakdown ? arqueo.countedPyg : Number(body.countedPyg)
    if (!int(countedPyg)) return error('El efectivo contado debe ser un entero no negativo.')
    const requestedSessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null
    const result = await prisma.$transaction(async (tx) => {
      const open = requestedSessionId
        ? await tx.$queryRaw<Array<{ id: string; openedAt: Date; openingPyg: number; openedById: string }>>`SELECT "id", "openedAt", "openingPyg", "openedById" FROM "CashSession" WHERE "id" = ${requestedSessionId} AND "tenantId" = ${ctx.session.user.tenantId} AND "branchId" = ${ctx.branchId} AND "status" = 'OPEN' FOR UPDATE`
        : await tx.$queryRaw<Array<{ id: string; openedAt: Date; openingPyg: number; openedById: string }>>`SELECT "id", "openedAt", "openingPyg", "openedById" FROM "CashSession" WHERE "tenantId" = ${ctx.session.user.tenantId} AND "branchId" = ${ctx.branchId} AND "openedById" = ${ctx.session.user.id} AND "status" = 'OPEN' FOR UPDATE`
      if (!open[0]) return null
      // Cerrar el turno de otra persona es de administración/gerencia.
      if (open[0].openedById !== ctx.session.user.id && !['ADMIN', 'GERENTE'].includes(ctx.session.user.role)) throw new Error('Solo administración o gerencia pueden cerrar el turno de otra persona.')
      const expectedPyg = Number(open[0].openingPyg) + await expected(tx, ctx.session.user.tenantId, ctx.branchId, open[0].openedAt, new Date(), open[0].openedById)
      if (!int(expectedPyg)) throw new Error('El total esperado excede el rango permitido.')
      const row = await tx.$queryRaw<Array<Record<string, unknown>>>`UPDATE "CashSession" SET "closedById" = ${ctx.session.user.id}, "closedAt" = ${new Date()}, "countedPyg" = ${countedPyg}, "expectedPyg" = ${expectedPyg}, "status" = 'CLOSED', "notes" = ${notes}, "countedBreakdown" = ${arqueo.breakdown ? JSON.stringify(arqueo.breakdown) : null}::jsonb WHERE "id" = ${open[0].id} RETURNING *`
      await tx.$executeRaw`INSERT INTO "AuditLog" ("id", "tenantId", "userId", "action", "entity", "entityId", "metadata") VALUES (${randomUUID()}, ${ctx.session.user.tenantId}, ${ctx.session.user.id}, 'CASH_CLOSED', 'CashSession', ${open[0].id}, ${JSON.stringify({ branchId: ctx.branchId, countedPyg, expectedPyg, differencePyg: countedPyg - expectedPyg, openedById: open[0].openedById, closedById: ctx.session.user.id, arqueo: Boolean(arqueo.breakdown) })}::jsonb)`
      return { row: row[0], expectedPyg }
    })
    if (!result) return error('No hay un turno de caja abierto para cerrar.', 409)
    return json({ ...result.row, differencePyg: countedPyg - result.expectedPyg })
  }
  if (action === 'movement') {
    const kind = body.kind; const direction = body.direction; const currency = body.currency ?? 'PYG'
    const originalAmount = Number(body.originalAmount); const exchangeRatePyg = Number(body.exchangeRatePyg ?? 1)
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const counterparty = body.counterparty == null || body.counterparty === '' ? null : typeof body.counterparty === 'string' && body.counterparty.trim().length <= 200 ? body.counterparty.trim() || null : undefined
    const reference = body.reference == null || body.reference === '' ? null : typeof body.reference === 'string' && body.reference.trim().length <= 200 ? body.reference.trim() || null : undefined
    const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
    if (!(CASH_MOVEMENT_KINDS as readonly string[]).includes(kind) || !['IN', 'OUT'].includes(direction) || !(FINANCE_CURRENCIES as readonly string[]).includes(currency) || !Number.isFinite(originalAmount) || originalAmount <= 0 || !Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0 || (currency === 'PYG' && exchangeRatePyg !== 1) || !description || description.length > 500 || counterparty === undefined || reference === undefined || (dueAt && !Number.isFinite(dueAt.getTime()))) return error('Movimiento financiero inválido.')
    const accountId = body.accountId == null || body.accountId === '' ? null : typeof body.accountId === 'string' ? body.accountId : undefined
    if (accountId === undefined) return error('Cuenta inválida.')
    // Misma conversión estricta (Decimal + HALF_UP) que usa createCashMovement:
    // conserva el 400 de esta ruta para montos convertidos fuera de rango.
    try { frozenAmountPyg(String(originalAmount), currency, String(exchangeRatePyg)) } catch (cause) { return error(cause instanceof Error ? cause.message : 'Movimiento financiero inválido.', 400) }
    try {
      const movement = await prisma.$transaction(async tx => {
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true } })
          if (!account || account.currency !== currency) throw new Error('Cuenta no válida para la moneda indicada.')
        }
        return createCashMovement(tx, {
          tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, createdById: ctx.session.user.id,
          kind, direction, currency,
          originalAmount: String(originalAmount), exchangeRatePyg: String(exchangeRatePyg),
          counterparty: counterparty ?? null, reference: reference ?? null, description, dueAt, accountId: accountId ?? null,
        }, { auditAction: 'CASH_MOVEMENT_RECORDED', auditMetadata: { accountId: accountId ?? null }, includeAccount: true })
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
