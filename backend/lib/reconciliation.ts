import type { Prisma } from '@prisma/client'
import { numero } from './montos'

// Conciliación y trazabilidad (#144).
//
// Los medios que mueven dinero contra una cuenta/procesadora son los que se
// concilian contra el extracto: efectivo, transferencia, tarjeta, Pix, USDT y
// canje. Las cuotas a crédito y el saldo a favor quedan afuera: su seguimiento
// vive en Cobranzas.
export const RECONCILIATION_METHODS = ['CASH', 'TRANSFER', 'CARD', 'TRADE_IN', 'PIX', 'CRYPTO'] as const

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  TRADE_IN: 'Canje',
  PIX: 'Pix',
  CRYPTO: 'USDT - Cripto',
}

type SnapshotLike = Record<string, unknown>

// La foto del pago manda sobre la cuenta actual: la cuenta pudo cambiar
// después del cobro y el historial tiene que conservar lo que se usó.
export function snapshotText(snapshot: unknown, key: string): string {
  if (!snapshot || typeof snapshot !== 'object') return ''
  const value = (snapshot as SnapshotLike)[key]
  return typeof value === 'string' ? value.trim() : ''
}

export type ReconciliationPayment = {
  id: string
  method: string
  status: string
  amountPyg: bigint | number
  currency: string | null
  reference: string | null
  accountId: string | null
  accountSnapshot: unknown
  account: { id: string; name: string; kind: string; bank: string | null; holder: string | null; processor: string | null } | null
  reconciliation: { state: string; note: string | null } | null
}

export type ReconciliationBatchLike = {
  accountId: string | null
  accountKind: string | null
  processor: string | null
  differencePyg: bigint | number
  state: string
}

export function processorOf(payment: ReconciliationPayment): string {
  return snapshotText(payment.accountSnapshot, 'processor') || payment.account?.processor || ''
}

export function accountLabelOf(payment: ReconciliationPayment): string {
  return snapshotText(payment.accountSnapshot, 'name') || payment.account?.name || METHOD_LABELS[payment.method] || payment.method
}

export function holderOf(payment: ReconciliationPayment): string {
  return snapshotText(payment.accountSnapshot, 'holder') || payment.account?.holder || ''
}

export function bankOf(payment: ReconciliationPayment): string {
  return snapshotText(payment.accountSnapshot, 'bank') || payment.account?.bank || ''
}

export function accountKindOf(payment: ReconciliationPayment): string {
  return snapshotText(payment.accountSnapshot, 'kind') || payment.account?.kind || payment.method
}

export type ReconciliationGroupRow = {
  key: string
  label: string
  secondary: string
  method: string | null
  processor: string
  currency: string | null
  count: number
  confirmedPyg: number
  pendingPyg: number
  refundedPyg: number
  verifiedPyg: number
  unverifiedPyg: number
  verifiedCount: number
  pendingCount: number
  differencePyg: number
}

export type ReconciliationSummary = {
  totals: {
    count: number
    confirmedPyg: number
    pendingPyg: number
    refundedPyg: number
    verifiedPyg: number
    unverifiedPyg: number
    verifiedCount: number
    pendingCount: number
    differencePyg: number
    batches: number
  }
  byAccount: ReconciliationGroupRow[]
  byMethod: ReconciliationGroupRow[]
  byProcessor: ReconciliationGroupRow[]
}

function emptyRow(key: string, label: string, secondary: string, method: string | null, processor: string, currency: string | null): ReconciliationGroupRow {
  return { key, label, secondary, method, processor, currency, count: 0, confirmedPyg: 0, pendingPyg: 0, refundedPyg: 0, verifiedPyg: 0, unverifiedPyg: 0, verifiedCount: 0, pendingCount: 0, differencePyg: 0 }
}

function addPayment(row: ReconciliationGroupRow, payment: ReconciliationPayment) {
  const amountPyg = numero(payment.amountPyg)
  row.count += 1
  if (payment.currency && !row.currency) row.currency = payment.currency
  if (payment.status === 'CONFIRMED') {
    const verified = payment.reconciliation?.state === 'VERIFIED'
    if (verified) { row.verifiedPyg += amountPyg; row.verifiedCount += 1 } else { row.unverifiedPyg += amountPyg; row.pendingCount += 1 }
  } else if (payment.status === 'PENDING') row.pendingPyg += amountPyg
  else if (payment.status === 'REFUNDED') row.refundedPyg += amountPyg
}

function addDifference(row: ReconciliationGroupRow, differencePyg: number) {
  row.differencePyg += differencePyg
}

function sortedRows(map: Map<string, ReconciliationGroupRow>) {
  return [...map.values()].sort((a, b) => (b.confirmedPyg + b.pendingPyg + b.refundedPyg) - (a.confirmedPyg + a.pendingPyg + a.refundedPyg) || a.label.localeCompare(b.label))
}

/**
 * Agrupa los pagos del período por cuenta, medio y procesadora, y reparte las
 * diferencias de los lotes de conciliación en el grupo correspondiente. Las
 * diferencias solo cuentan para lotes no rechazados.
 */
export function summarizeReconciliation(payments: ReconciliationPayment[], batches: ReconciliationBatchLike[] = []): ReconciliationSummary {
  const byAccount = new Map<string, ReconciliationGroupRow>()
  const byMethod = new Map<string, ReconciliationGroupRow>()
  const byProcessor = new Map<string, ReconciliationGroupRow>()
  const totals: ReconciliationSummary['totals'] = { count: 0, confirmedPyg: 0, pendingPyg: 0, refundedPyg: 0, verifiedPyg: 0, unverifiedPyg: 0, verifiedCount: 0, pendingCount: 0, differencePyg: 0, batches: 0 }

  for (const payment of payments) {
    const amountPyg = numero(payment.amountPyg)
    const processor = processorOf(payment)
    const accountKey = payment.accountId || `metodo:${payment.method}`
    const method = accountKindOf(payment)
    const accountRow = byAccount.get(accountKey) || emptyRow(accountKey, accountLabelOf(payment), [holderOf(payment), bankOf(payment)].filter(Boolean).join(' · '), method, processor, payment.currency)
    addPayment(accountRow, payment)
    byAccount.set(accountKey, accountRow)

    const methodRow = byMethod.get(method) || emptyRow(method, METHOD_LABELS[method] || method, '', method, processor, null)
    addPayment(methodRow, payment)
    byMethod.set(method, methodRow)

    const processorKey = processor || 'sin-procesadora'
    const processorRow = byProcessor.get(processorKey) || emptyRow(processorKey, processor || 'Sin procesadora', '', method, processor, null)
    addPayment(processorRow, payment)
    byProcessor.set(processorKey, processorRow)

    totals.count += 1
    if (payment.status === 'CONFIRMED') {
      totals.confirmedPyg += amountPyg
      if (payment.reconciliation?.state === 'VERIFIED') { totals.verifiedPyg += amountPyg; totals.verifiedCount += 1 } else { totals.unverifiedPyg += amountPyg; totals.pendingCount += 1 }
    } else if (payment.status === 'PENDING') totals.pendingPyg += amountPyg
    else if (payment.status === 'REFUNDED') totals.refundedPyg += amountPyg
  }

  for (const batch of batches) {
    const differencePyg = numero(batch.differencePyg)
    if (batch.state === 'REJECTED' || !differencePyg) continue
    totals.differencePyg += differencePyg
    totals.batches += 1
    const accountKey = batch.accountId || 'sin-cuenta'
    const accountRow = byAccount.get(accountKey) || emptyRow(accountKey, 'Sin cuenta', '', batch.accountKind, batch.processor || '', null)
    addDifference(accountRow, differencePyg)
    byAccount.set(accountKey, accountRow)
    const methodKey = batch.accountKind || 'sin-medio'
    const methodRow = byMethod.get(methodKey) || emptyRow(methodKey, METHOD_LABELS[methodKey] || 'Sin medio', '', methodKey, batch.processor || '', null)
    addDifference(methodRow, differencePyg)
    byMethod.set(methodKey, methodRow)
    const processorKey = batch.processor || 'sin-procesadora'
    const processorRow = byProcessor.get(processorKey) || emptyRow(processorKey, batch.processor || 'Sin procesadora', '', batch.accountKind, batch.processor || '', null)
    addDifference(processorRow, differencePyg)
    byProcessor.set(processorKey, processorRow)
  }

  return { totals, byAccount: sortedRows(byAccount), byMethod: sortedRows(byMethod), byProcessor: sortedRows(byProcessor) }
}

export type LockedPaymentRow = {
  id: string
  orderId: string
  status: string
  amountPyg: bigint | number
  method: string
  deliveryUserId: string | null
  deliverySettlementId: string | null
  pendingReason: string | null
  createdById: string | null
  userId: string | null
  dueAt: Date | null
}

/** Bloquea el pago para conciliarlo sin carreras con otro cobro/rendición. */
export async function lockPaymentRow(tx: Prisma.TransactionClient, tenantId: string, paymentId: string): Promise<LockedPaymentRow | null> {
  const rows = await tx.$queryRaw<LockedPaymentRow[]>`
    SELECT "id", "orderId", "status"::text AS "status", "amountPyg", "method"::text AS "method", "deliveryUserId", "deliverySettlementId", "pendingReason", "createdById", "userId", "dueAt" FROM "Payment"
    WHERE "id" = ${paymentId} AND "tenantId" = ${tenantId} FOR UPDATE`
  return rows[0] ?? null
}

/**
 * La cuota rechazada queda como intento fallido (REJECTED, sin vencimiento: ya no es una cuota) y se
 * crea una cuota nueva idéntica en PENDING/CREDIT con el vencimiento y el monto originales. Así el
 * intento rechazado conserva su comprobante y su conciliación, la cuota se puede volver a cobrar y la
 * suma de cuotas + cobros confirmados sigue siendo el total de la venta (nada se duplica ni se pierde).
 * Devuelve los datos de la cuota restaurada (para auditoría y aviso) o null si no corresponde.
 */
async function restoreRejectedInstallment(tx: Prisma.TransactionClient, { tenantId, userId, row }: { tenantId: string; userId: string; row: LockedPaymentRow }) {
  if (!row.dueAt) return null
  const order = await tx.order.findFirst({ where: { id: row.orderId, tenantId }, select: { status: true } })
  if (!order || order.status === 'CANCELLED') return null
  const original = await tx.payment.findUnique({ where: { id: row.id }, select: { createdById: true, userId: true, remindedAt: true, overdueRemindedAt: true, whatsappRemindedAt: true, whatsappOverdueRemindedAt: true } })
  const plan = await tx.payment.findMany({ where: { orderId: row.orderId, tenantId, dueAt: { not: null } }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
  const posicion = Math.max(1, plan.findIndex(item => item.id === row.id) + 1)
  const nueva = await tx.payment.create({
    data: {
      tenantId, orderId: row.orderId, method: 'CREDIT', status: 'PENDING', pendingReason: 'CUOTA', amountPyg: row.amountPyg,
      reference: `Cuota ${posicion}/${Math.max(plan.length, posicion)}`, dueAt: row.dueAt,
      createdById: original?.createdById ?? userId, userId: original?.userId ?? userId,
      remindedAt: original?.remindedAt ?? null, overdueRemindedAt: original?.overdueRemindedAt ?? null,
      whatsappRemindedAt: original?.whatsappRemindedAt ?? null, whatsappOverdueRemindedAt: original?.whatsappOverdueRemindedAt ?? null,
    },
    select: { id: true },
  })
  await tx.payment.update({ where: { id: row.id }, data: { dueAt: null } })
  const cuota = { installmentId: nueva.id, dueAt: row.dueAt.toISOString(), amountPyg: Number(row.amountPyg) }
  await tx.auditLog.create({ data: { tenantId, userId, action: 'CREDIT_INSTALLMENT_RESTORED', entity: 'Payment', entityId: row.id, metadata: { orderId: row.orderId, ...cuota } } })
  return cuota
}

/**
 * Conciliar un pago PENDING lo confirma (o rechaza) de verdad: la deuda baja y
 * el pedido se cierra si queda pago. El cobro de calle del repartidor queda
 * afuera: su ciclo es la rendición, no la conciliación bancaria.
 */
export async function confirmReconciledPayment(
  tx: Prisma.TransactionClient,
  { tenantId, userId, row, state, note, via }: { tenantId: string; userId: string; row: LockedPaymentRow; state: 'VERIFIED' | 'REJECTED'; note: string | null; via?: string },
) {
  if (row.status !== 'PENDING' || row.deliveryUserId || row.deliverySettlementId) return false
  const nextStatus = state === 'VERIFIED' ? 'CONFIRMED' : 'REJECTED'
  // El cobro cuenta desde que se aprueba: paidAt = fecha de aprobación (decisión de Dario).
  const approvedAt = new Date()
  let settlesAt: Date | undefined
  if (nextStatus === 'CONFIRMED') {
    // La acreditación estimada (tarjeta, PIX) corre desde la aprobación, no desde el cobro.
    const snapshot = (await tx.payment.findUnique({ where: { id: row.id }, select: { accountSnapshot: true } }))?.accountSnapshot
    const days = Number(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? (snapshot as Record<string, unknown>).settlementDays : 0)
    if (Number.isSafeInteger(days) && days > 0) settlesAt = new Date(approvedAt.getTime() + days * 86400000)
  }
  await tx.payment.update({ where: { id: row.id }, data: { status: nextStatus, ...(nextStatus === 'CONFIRMED' ? { paidAt: approvedAt, ...(settlesAt ? { settlesAt } : {}) } : {}) } })
  // Una cuota del plan de crédito cobrada por un medio «a verificar» y rechazada no puede desaparecer:
  // la deuda sigue abierta y tiene que seguir teniendo su cuota con el vencimiento original.
  const cuotaRestaurada = nextStatus === 'REJECTED' && row.dueAt ? await restoreRejectedInstallment(tx, { tenantId, userId, row }) : null
  if (nextStatus === 'CONFIRMED') {
    const pedidos = await tx.$queryRaw<Array<{ id: string; status: string; totalPyg: number }>>`
      SELECT "id", "status"::text AS "status", "totalPyg" FROM "Order"
      WHERE "id" = ${row.orderId} AND "tenantId" = ${tenantId} FOR UPDATE`
    const order = pedidos[0]
    if (order && order.status !== 'CANCELLED') {
      const paid = await tx.payment.aggregate({ where: { orderId: order.id, tenantId, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
      if ((paid._sum.amountPyg || 0) >= order.totalPyg) await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } })
    }
  }
  await tx.auditLog.create({ data: { tenantId, userId, action: nextStatus === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED', entity: 'Payment', entityId: row.id, metadata: { orderId: row.orderId, amountPyg: row.amountPyg, method: row.method, note, pendingReason: row.pendingReason, ...(via ? { via } : {}), ...(cuotaRestaurada ? { cuotaRestaurada } : {}) } } })
  return true
}

export type DailyDeclaration = { method: string; accountId: string | null; currency: string; receivedPyg: number }
export type DailyPayment = { id: string; method: string; accountId: string | null; currency: string | null; amountPyg: number | bigint; status: string; label?: string }
export const dailyGroupKey = (row: { method: string; accountId: string | null; currency: string | null }) => JSON.stringify([row.method, row.accountId || '', row.currency || 'PYG'])

/** Una declaración es independiente: nunca se completa con el monto del sistema. */
export function evaluateDailyReconciliation(payments: DailyPayment[], declarations: DailyDeclaration[] | null) {
  const groups = new Map<string, { key: string; method: string; accountId: string | null; currency: string; label: string; expectedPyg: number; receivedPyg: number | null; differencePyg: number | null; count: number }>()
  const group = (row: { method: string; accountId: string | null; currency: string | null; label?: string }) => {
    const key = dailyGroupKey(row)
    if (!groups.has(key)) groups.set(key, { key, method: row.method, accountId: row.accountId, currency: row.currency || 'PYG', label: row.label || METHOD_LABELS[row.method] || row.method, expectedPyg: 0, receivedPyg: null, differencePyg: null, count: 0 })
    return groups.get(key)!
  }
  // Aun sin ventas, declarar caja cero es una afirmación explícita del responsable.
  group({ method: 'CASH', accountId: null, currency: 'PYG' })
  const seen = new Set<string>()
  for (const payment of payments) {
    if (payment.status !== 'CONFIRMED' || !(RECONCILIATION_METHODS as readonly string[]).includes(payment.method) || seen.has(payment.id)) continue
    seen.add(payment.id)
    const row = group(payment)
    row.expectedPyg += numero(payment.amountPyg); row.count++
    if (!Number.isSafeInteger(row.expectedPyg)) throw new Error('El total del día supera el rango permitido.')
  }
  for (const declaration of declarations || []) {
    const row = group(declaration)
    row.receivedPyg = declaration.receivedPyg
    row.differencePyg = declaration.receivedPyg - row.expectedPyg
  }
  const rows = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
  const missing = rows.filter(row => row.receivedPyg === null).length
  const differences = rows.filter(row => row.differencePyg !== null && row.differencePyg !== 0).length
  return {
    state: differences ? 'DIFFERENCE' : missing ? 'PENDING' : 'VERIFIED',
    groups: rows, missing, differences,
    expectedPyg: rows.reduce((sum, row) => sum + row.expectedPyg, 0),
    receivedPyg: rows.reduce((sum, row) => sum + (row.receivedPyg ?? 0), 0),
    differencePyg: rows.reduce((sum, row) => sum + (row.differencePyg ?? 0), 0),
  }
}
