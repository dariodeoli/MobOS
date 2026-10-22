import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { InputError } from './payment-input'
import { LIMITE_MONTO_GENERAL, numero } from './montos'
import { COUNTABLE_PAYMENT_WHERE } from './payment-net'
import { METHOD_LABELS, RECONCILIATION_METHODS, accountLabelOf, lockPaymentRow, snapshotText } from './reconciliation'
import { reconciliationDayRange } from './reconciliation-day'
import { notifyPaymentResolved, resolvePaymentVerification, type PaymentActor } from './payment-verification'
import { canResolvePayment } from './payment-verification-scope'
import type { PaymentVerificationPolicy } from './payment-verification-policy'

// Verificación diaria (Finanzas › Verificación): todo lo que entró en el día
// por medio y cuenta, con el detalle por pedido, y las acciones para
// verificarlo: todos, una categoría o uno por uno. Usa los MISMOS estados de
// pago y la misma auditoría que el panel «Pagos por verificar»: verificar un
// pago por verificar lo aprueba (PENDING → CONFIRMED); verificar uno ya
// cobrado (efectivo, tarjeta) lo marca como conciliado. Idempotente: lo que ya
// está verificado no se toca. Nadie verifica lo propio salvo que su rol esté en
// `selfApproveRoles`. El día es el de la venta (hora de Paraguay), por la fecha
// en que se registró el cobro. Las diferencias (esperado vs recibido) quedan en
// PaymentVerificationDiscrepancy con motivo y autor.

export type DayLineState = 'VERIFIED' | 'TO_VERIFY' | 'PENDING' | 'REJECTED'
export type DayState = 'OPEN' | 'VERIFIED' | 'DISCREPANCIES'
const MAX_PAYMENTS = 5000

const dayWhere = (tenantId: string, branchId: string, start: Date, end: Date): Prisma.PaymentWhereInput => ({
  tenantId, order: { tenantId, branchId }, method: { in: [...RECONCILIATION_METHODS] }, createdAt: { gte: start, lt: end }, ...COUNTABLE_PAYMENT_WHERE,
  OR: [{ status: 'CONFIRMED' }, { status: { in: ['PENDING', 'REJECTED'] }, pendingReason: 'VERIFICACION' }],
})

const SELECT = {
  id: true, orderId: true, method: true, status: true, amountPyg: true, currency: true, reference: true, accountId: true, accountSnapshot: true, pendingReason: true,
  createdAt: true, createdById: true, userId: true, deliveryUserId: true,
  createdBy: { select: { name: true } },
  order: { select: { orderNumber: true, sellerId: true, customer: { select: { name: true } } } },
  reconciliation: { select: { state: true, note: true, resolvedVia: true, resolvedAt: true, verifiedBy: { select: { name: true } } } },
} satisfies Prisma.PaymentSelect

type DayPayment = Prisma.PaymentGetPayload<{ select: typeof SELECT }>
type Db = Prisma.TransactionClient | typeof prisma

const lineState = (payment: DayPayment): DayLineState => {
  if (payment.status === 'REJECTED' || payment.reconciliation?.state === 'REJECTED') return 'REJECTED'
  if (payment.status === 'PENDING') return 'PENDING'
  return payment.reconciliation?.state === 'VERIFIED' ? 'VERIFIED' : 'TO_VERIFY'
}
const groupKey = (payment: { method: string; accountId: string | null; currency: string | null }) => JSON.stringify([payment.method, payment.accountId || '', payment.currency || 'PYG'])

async function loadDayPayments(db: Db, tenantId: string, branchId: string, day: string) {
  const { start, end } = reconciliationDayRange(day)
  const rows = await db.payment.findMany({ where: dayWhere(tenantId, branchId, start, end), select: SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_PAYMENTS + 1 })
  if (rows.length > MAX_PAYMENTS) throw new InputError('Este día supera los 5000 cobros: no se puede verificar una muestra incompleta.', 409)
  return rows
}

export async function dailyVerificationView(db: Db, input: { tenantId: string; branchId: string; day: string; actor: PaymentActor; policy: PaymentVerificationPolicy }) {
  const { tenantId, branchId, day, actor, policy } = input
  reconciliationDayRange(day)
  const [payments, discrepancies] = await Promise.all([
    loadDayPayments(db, tenantId, branchId, day),
    db.paymentVerificationDiscrepancy.findMany({ where: { tenantId, branchId, businessDay: day }, orderBy: { createdAt: 'asc' } }),
  ])
  const people = await db.user.findMany({ where: { tenantId, id: { in: [...new Set(discrepancies.flatMap(row => [row.createdById, row.resolvedById]).filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true } })
  const names = new Map(people.map(person => [person.id, person.name]))

  type Group = {
    key: string; method: string; accountId: string | null; currency: string; label: string; methodLabel: string
    count: number; confirmedPyg: number; verifiedPyg: number; toVerifyPyg: number; pendingPyg: number; rejectedPyg: number
    verifiedCount: number; toVerifyCount: number; pendingCount: number; rejectedCount: number; openDiscrepancies: number
    payments: Array<Record<string, unknown>>
  }
  const groups = new Map<string, Group>()
  for (const payment of payments) {
    const key = groupKey(payment)
    let group = groups.get(key)
    if (!group) {
      group = { key, method: payment.method, accountId: payment.accountId, currency: payment.currency || 'PYG', label: accountLabelOf(payment as never), methodLabel: METHOD_LABELS[snapshotText(payment.accountSnapshot, 'kind') || payment.method] || payment.method,
        count: 0, confirmedPyg: 0, verifiedPyg: 0, toVerifyPyg: 0, pendingPyg: 0, rejectedPyg: 0, verifiedCount: 0, toVerifyCount: 0, pendingCount: 0, rejectedCount: 0, openDiscrepancies: 0, payments: [] }
      groups.set(key, group)
    }
    const state = lineState(payment)
    const amountPyg = numero(payment.amountPyg)
    group.count++
    if (state === 'VERIFIED') { group.confirmedPyg += amountPyg; group.verifiedPyg += amountPyg; group.verifiedCount++ }
    else if (state === 'TO_VERIFY') { group.confirmedPyg += amountPyg; group.toVerifyPyg += amountPyg; group.toVerifyCount++ }
    else if (state === 'PENDING') { group.pendingPyg += amountPyg; group.pendingCount++ }
    else { group.rejectedPyg += amountPyg; group.rejectedCount++ }
    group.payments.push({
      id: payment.id, orderId: payment.orderId, orderNumber: payment.order.orderNumber, amountPyg, customerName: payment.order.customer?.name ?? null,
      collectedByName: payment.createdBy?.name ?? null, collectedById: payment.createdById ?? payment.userId, at: payment.createdAt.toISOString(), reference: payment.reference,
      status: payment.status, state, verifiedByName: payment.reconciliation?.verifiedBy?.name ?? null, verifiedAt: payment.reconciliation?.resolvedAt?.toISOString() ?? null,
      resolvedVia: payment.reconciliation?.resolvedVia ?? null, note: payment.reconciliation?.note ?? null,
      canVerify: state !== 'VERIFIED' && state !== 'REJECTED' && canResolvePayment(actor.role, actor.id, payment, policy),
    })
  }
  const discrepancyRows = discrepancies.map(row => ({
    id: row.id, scope: row.scope, paymentId: row.paymentId, method: row.method, accountId: row.accountId, currency: row.currency,
    expectedPyg: numero(row.expectedPyg), receivedPyg: numero(row.receivedPyg), differencePyg: numero(row.receivedPyg) - numero(row.expectedPyg), reason: row.reason,
    createdById: row.createdById, createdByName: names.get(row.createdById) ?? null, createdAt: row.createdAt.toISOString(),
    resolved: Boolean(row.resolvedAt), resolvedAt: row.resolvedAt?.toISOString() ?? null, resolvedByName: row.resolvedById ? names.get(row.resolvedById) ?? null : null, resolvedNote: row.resolvedNote,
  }))
  for (const row of discrepancyRows) {
    if (row.resolved) continue
    const payment = row.paymentId ? payments.find(item => item.id === row.paymentId) : null
    const group = groups.get(payment ? groupKey(payment) : JSON.stringify([row.method, row.accountId || '', row.currency || 'PYG']))
    if (group) group.openDiscrepancies++
  }
  const list = [...groups.values()].sort((a, b) => b.confirmedPyg + b.pendingPyg - (a.confirmedPyg + a.pendingPyg) || a.label.localeCompare(b.label))
  const sum = (field: 'confirmedPyg' | 'verifiedPyg' | 'toVerifyPyg' | 'pendingPyg' | 'rejectedPyg') => list.reduce((total, group) => total + group[field], 0)
  const unresolved = list.reduce((total, group) => total + group.toVerifyCount + group.pendingCount, 0)
  const openDiscrepancies = discrepancyRows.filter(row => !row.resolved).length
  const state: DayState = openDiscrepancies ? 'DISCREPANCIES' : unresolved ? 'OPEN' : 'VERIFIED'
  return {
    day, branchId, state, unresolved, openDiscrepancies,
    totals: { count: payments.length, confirmedPyg: sum('confirmedPyg'), verifiedPyg: sum('verifiedPyg'), toVerifyPyg: sum('toVerifyPyg'), pendingPyg: sum('pendingPyg'), rejectedPyg: sum('rejectedPyg') },
    groups: list, discrepancies: discrepancyRows,
  }
}

export type VerifyScope = { kind: 'ALL' } | { kind: 'CATEGORY'; method: string; accountId: string | null; currency: string } | { kind: 'ONE'; paymentId: string }
export type DayVerificationResult = {
  scope: VerifyScope['kind']
  attempted: number
  verified: number
  alreadyVerified: number
  skipped: Array<{ paymentId: string; orderNumber: string | null; code: 'OWN' | 'PROOF' | 'CONFLICT' | 'DELIVERY'; reason: string }>
}

/** Verifica los pagos del día del alcance pedido. Un pago a la vez, cada uno en su transacción: reintentar es seguro. */
export async function verifyDayPayments(input: { tenantId: string; branchId: string; day: string; actor: PaymentActor; policy: PaymentVerificationPolicy; scope: VerifyScope }): Promise<DayVerificationResult> {
  const { tenantId, branchId, day, actor, policy, scope } = input
  const payments = await loadDayPayments(prisma, tenantId, branchId, day)
  let targets = payments.filter(payment => lineState(payment) !== 'VERIFIED' && lineState(payment) !== 'REJECTED')
  if (scope.kind === 'CATEGORY') {
    if (!(RECONCILIATION_METHODS as readonly string[]).includes(scope.method)) throw new InputError('Medio inválido.')
    targets = targets.filter(payment => groupKey(payment) === JSON.stringify([scope.method, scope.accountId || '', scope.currency || 'PYG']))
  } else if (scope.kind === 'ONE') {
    const one = payments.find(payment => payment.id === scope.paymentId)
    if (!one) throw new InputError('El pago no es de este día y sucursal.', 404)
    targets = lineState(one) === 'REJECTED' ? [] : [one]
    if (lineState(one) === 'REJECTED') throw new InputError('El pago fue rechazado: no se verifica.', 409)
  }
  const result: DayVerificationResult = { scope: scope.kind, attempted: targets.length, verified: 0, alreadyVerified: 0, skipped: [] }
  const resolvedNow: Array<{ id: string; orderId: string; sellerId: string | null }> = []
  for (const payment of targets) {
    try {
      const outcome = await prisma.$transaction(async tx => {
        const row = await lockPaymentRow(tx, tenantId, payment.id)
        if (!row) throw new InputError('Pago no encontrado.', 404)
        const resolved = await resolvePaymentVerification(tx, { tenantId, actor, row, state: 'VERIFIED', note: null, policy })
        return { resolved, wasPending: row.status === 'PENDING' }
      })
      if (outcome.resolved.outcome === 'noop') result.alreadyVerified++
      else {
        result.verified++
        if (outcome.wasPending) resolvedNow.push({ id: payment.id, orderId: payment.orderId, sellerId: payment.order.sellerId })
      }
    } catch (cause) {
      if (!(cause instanceof InputError)) throw cause
      if (scope.kind === 'ONE') throw cause
      const code = cause.status === 403 ? 'OWN' : /comprobante/i.test(cause.message) ? 'PROOF' : /reparto|rendición/i.test(cause.message) ? 'DELIVERY' : 'CONFLICT'
      result.skipped.push({ paymentId: payment.id, orderNumber: payment.order.orderNumber, code, reason: cause.message })
    }
  }
  await prisma.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_DAY_VERIFIED', entity: 'PaymentVerificationDay', entityId: `${branchId}:${day}`, metadata: { branchId, day, scope: scope.kind, ...(scope.kind === 'CATEGORY' ? { method: scope.method, accountId: scope.accountId } : scope.kind === 'ONE' ? { paymentId: scope.paymentId } : {}), attempted: result.attempted, verified: result.verified, alreadyVerified: result.alreadyVerified, skipped: result.skipped.length } } })
  for (const item of resolvedNow) await notifyPaymentResolved({ tenantId, paymentId: item.id, orderId: item.orderId, sellerId: item.sellerId, approved: true })
  return result
}

export type DiscrepancyInput = {
  tenantId: string; branchId: string; day: string; actor: PaymentActor
  scope: 'LINE' | 'CATEGORY'; paymentId?: string | null; method?: string | null; accountId?: string | null; currency?: string | null
  receivedPyg: number; reason: string; requestId?: string | null
}

/** Registra una diferencia entre lo esperado por el sistema y lo recibido. Idempotente por `requestId` o por la misma diferencia abierta. */
export async function recordDayDiscrepancy(input: DiscrepancyInput) {
  const { tenantId, branchId, day, actor } = input
  reconciliationDayRange(day)
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason || reason.length > 500) throw new InputError('Indicá el motivo de la diferencia (hasta 500 caracteres).')
  if (!Number.isSafeInteger(input.receivedPyg) || input.receivedPyg < 0 || input.receivedPyg > LIMITE_MONTO_GENERAL) throw new InputError('Lo recibido debe ser un importe entero en Gs válido, incluido cero.')
  if (input.requestId != null && !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new InputError('Identificador de operación inválido.')
  if (input.scope !== 'LINE' && input.scope !== 'CATEGORY') throw new InputError('scope debe ser LINE o CATEGORY.')

  return prisma.$transaction(async tx => {
    const view = await loadDayPayments(tx, tenantId, branchId, day)
    let method: string; let accountId: string | null; let currency: string; let expectedPyg: number; let paymentId: string | null = null
    if (input.scope === 'LINE') {
      const payment = view.find(item => item.id === input.paymentId)
      if (!payment) throw new InputError('El pago no es de este día y sucursal.', 404)
      if (lineState(payment) === 'REJECTED') throw new InputError('El pago fue rechazado: no se registra diferencia.', 409)
      method = payment.method; accountId = payment.accountId; currency = payment.currency || 'PYG'; expectedPyg = numero(payment.amountPyg); paymentId = payment.id
    } else {
      method = String(input.method || ''); accountId = input.accountId || null; currency = input.currency || 'PYG'
      if (!(RECONCILIATION_METHODS as readonly string[]).includes(method)) throw new InputError('Medio inválido.')
      const key = JSON.stringify([method, accountId || '', currency])
      const lines = view.filter(item => groupKey(item) === key && ['VERIFIED', 'TO_VERIFY'].includes(lineState(item)))
      expectedPyg = lines.reduce((total, item) => total + numero(item.amountPyg), 0)
    }
    if (input.receivedPyg === expectedPyg) throw new InputError('Lo recibido coincide con lo esperado: no hay diferencia que registrar.')

    if (input.requestId) {
      const previous = await tx.paymentVerificationDiscrepancy.findUnique({ where: { tenantId_requestId: { tenantId, requestId: input.requestId } } })
      if (previous) {
        if (previous.branchId !== branchId || previous.businessDay !== day || previous.paymentId !== paymentId || previous.method !== method || numero(previous.receivedPyg) !== input.receivedPyg) throw new InputError('El identificador ya pertenece a otra diferencia.', 409)
        return { discrepancy: previous, created: false }
      }
    }
    const duplicate = await tx.paymentVerificationDiscrepancy.findFirst({ where: { tenantId, branchId, businessDay: day, scope: input.scope, paymentId, method, accountId, currency, receivedPyg: input.receivedPyg, expectedPyg, resolvedAt: null } })
    if (duplicate) return { discrepancy: duplicate, created: false }
    const discrepancy = await tx.paymentVerificationDiscrepancy.create({ data: { tenantId, branchId, businessDay: day, scope: input.scope, paymentId, method, accountId, currency, expectedPyg, receivedPyg: input.receivedPyg, reason, requestId: input.requestId ?? null, createdById: actor.id } })
    await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_DISCREPANCY_RECORDED', entity: 'PaymentVerificationDiscrepancy', entityId: discrepancy.id, metadata: { branchId, day, scope: input.scope, paymentId, method, accountId, currency, expectedPyg, receivedPyg: input.receivedPyg, differencePyg: input.receivedPyg - expectedPyg, reason } } })
    return { discrepancy, created: true }
  })
}

/** Cierra una diferencia ya revisada (con una nota). Si ya estaba resuelta, no hace nada. */
export async function resolveDayDiscrepancy(input: { tenantId: string; branchId: string; actor: PaymentActor; discrepancyId: string; note: string | null }) {
  const { tenantId, branchId, actor } = input
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string; resolvedAt: Date | null }>>`SELECT "id", "resolvedAt" FROM "PaymentVerificationDiscrepancy" WHERE "id" = ${input.discrepancyId} AND "tenantId" = ${tenantId} AND "branchId" = ${branchId} FOR UPDATE`
    if (!rows.length) throw new InputError('Diferencia no encontrada.', 404)
    if (rows[0].resolvedAt) return { resolved: false, id: rows[0].id }
    const note = input.note?.trim() || null
    if (note && note.length > 500) throw new InputError('La nota admite hasta 500 caracteres.')
    await tx.paymentVerificationDiscrepancy.update({ where: { id: rows[0].id }, data: { resolvedAt: new Date(), resolvedById: actor.id, resolvedNote: note } })
    await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_DISCREPANCY_RESOLVED', entity: 'PaymentVerificationDiscrepancy', entityId: rows[0].id, metadata: { branchId, note } } })
    return { resolved: true, id: rows[0].id }
  })
}
