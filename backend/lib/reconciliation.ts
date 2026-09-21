import type { Prisma } from '@prisma/client'

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
  amountPyg: number
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
  differencePyg: number
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
  row.count += 1
  if (payment.currency && !row.currency) row.currency = payment.currency
  if (payment.status === 'CONFIRMED') {
    const verified = payment.reconciliation?.state === 'VERIFIED'
    if (verified) { row.verifiedPyg += payment.amountPyg; row.verifiedCount += 1 } else { row.unverifiedPyg += payment.amountPyg; row.pendingCount += 1 }
  } else if (payment.status === 'PENDING') row.pendingPyg += payment.amountPyg
  else if (payment.status === 'REFUNDED') row.refundedPyg += payment.amountPyg
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
      totals.confirmedPyg += payment.amountPyg
      if (payment.reconciliation?.state === 'VERIFIED') { totals.verifiedPyg += payment.amountPyg; totals.verifiedCount += 1 } else { totals.unverifiedPyg += payment.amountPyg; totals.pendingCount += 1 }
    } else if (payment.status === 'PENDING') totals.pendingPyg += payment.amountPyg
    else if (payment.status === 'REFUNDED') totals.refundedPyg += payment.amountPyg
  }

  for (const batch of batches) {
    if (batch.state === 'REJECTED' || !batch.differencePyg) continue
    totals.differencePyg += batch.differencePyg
    totals.batches += 1
    const accountKey = batch.accountId || 'sin-cuenta'
    const accountRow = byAccount.get(accountKey) || emptyRow(accountKey, 'Sin cuenta', '', batch.accountKind, batch.processor || '', null)
    addDifference(accountRow, batch.differencePyg)
    byAccount.set(accountKey, accountRow)
    const methodKey = batch.accountKind || 'sin-medio'
    const methodRow = byMethod.get(methodKey) || emptyRow(methodKey, METHOD_LABELS[methodKey] || 'Sin medio', '', methodKey, batch.processor || '', null)
    addDifference(methodRow, batch.differencePyg)
    byMethod.set(methodKey, methodRow)
    const processorKey = batch.processor || 'sin-procesadora'
    const processorRow = byProcessor.get(processorKey) || emptyRow(processorKey, batch.processor || 'Sin procesadora', '', batch.accountKind, batch.processor || '', null)
    addDifference(processorRow, batch.differencePyg)
    byProcessor.set(processorKey, processorRow)
  }

  return { totals, byAccount: sortedRows(byAccount), byMethod: sortedRows(byMethod), byProcessor: sortedRows(byProcessor) }
}

export type LockedPaymentRow = {
  id: string
  orderId: string
  status: string
  amountPyg: number
  method: string
  deliveryUserId: string | null
  deliverySettlementId: string | null
}

/** Bloquea el pago para conciliarlo sin carreras con otro cobro/rendición. */
export async function lockPaymentRow(tx: Prisma.TransactionClient, tenantId: string, paymentId: string): Promise<LockedPaymentRow | null> {
  const rows = await tx.$queryRaw<LockedPaymentRow[]>`
    SELECT "id", "orderId", "status"::text AS "status", "amountPyg", "method"::text AS "method", "deliveryUserId", "deliverySettlementId" FROM "Payment"
    WHERE "id" = ${paymentId} AND "tenantId" = ${tenantId} FOR UPDATE`
  return rows[0] ?? null
}

/**
 * Conciliar un pago PENDING lo confirma (o rechaza) de verdad: la deuda baja y
 * el pedido se cierra si queda pago. El cobro de calle del repartidor queda
 * afuera: su ciclo es la rendición, no la conciliación bancaria.
 */
export async function confirmReconciledPayment(
  tx: Prisma.TransactionClient,
  { tenantId, userId, row, state, note }: { tenantId: string; userId: string; row: LockedPaymentRow; state: 'VERIFIED' | 'REJECTED'; note: string | null },
) {
  if (row.status !== 'PENDING' || row.deliveryUserId || row.deliverySettlementId) return false
  const nextStatus = state === 'VERIFIED' ? 'CONFIRMED' : 'REJECTED'
  await tx.payment.update({ where: { id: row.id }, data: { status: nextStatus, ...(nextStatus === 'CONFIRMED' ? { paidAt: new Date() } : {}) } })
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
  await tx.auditLog.create({ data: { tenantId, userId, action: nextStatus === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED', entity: 'Payment', entityId: row.id, metadata: { orderId: row.orderId, amountPyg: row.amountPyg, method: row.method, note } } })
  return true
}
