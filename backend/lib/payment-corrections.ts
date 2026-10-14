import { Prisma } from '@prisma/client'
import { InputError, normalizePayment, objectInput, textInput } from './payment-input'
import { canAccessOrder } from './orders'
import { numero } from './montos'
import { canCorrectPayment, staffCorrectsPaymentsFrom } from './payment-correction-policy'

// Corrección del medio de pago de una venta (#393). El pago original nunca se
// edita: se agrega una reversión (monto negativo, mismo medio y cuenta) y N pagos
// nuevos que suman exactamente el original. Σ CONFIRMED del pedido no cambia.

/**
 * Qué pasa con el efectivo cuando el pago salió de un turno de caja ya cerrado.
 * false = la corrección solo afecta reportes (el cierre guardado y el arqueo de
 * hoy no se tocan). Pendiente de confirmación del dueño: cambiar acá basta.
 */
export const CLOSED_SHIFT_AFFECTS_DRAWER = false

/** Medios que v1 no corrige (422): se pagan con otro activo o tienen su propio ciclo. */
export const UNSUPPORTED_METHODS = ['TRADE_IN', 'STORE_CREDIT', 'GIFT_CARD', 'CREDIT', 'CRYPTO'] as const
const REVERSAL_SUFFIX = ':rev'

export type CorrectionRowInput = { accountId: string; amountPyg: number; toDriver: boolean }

export function parseCorrectionBody(value: unknown): { reason: string; rows: CorrectionRowInput[] } {
  const body = objectInput(value)
  if (Object.keys(body).some(key => !['reason', 'payments'].includes(key))) throw new InputError('La corrección contiene campos no admitidos.')
  const reason = textInput(body.reason, 'Motivo', 500)
  if (reason.length < 3) throw new InputError('Indicá un motivo de al menos 3 caracteres.')
  if (!Array.isArray(body.payments) || body.payments.length < 1 || body.payments.length > 10) throw new InputError('Indicá entre 1 y 10 pagos nuevos.')
  const rows = body.payments.map((raw, index) => {
    const row = objectInput(raw)
    if (Object.keys(row).some(key => !['accountId', 'amount', 'toDriver'].includes(key))) throw new InputError(`El pago ${index + 1} contiene campos no admitidos.`)
    const accountId = textInput(row.accountId, 'accountId', 200)
    const amountPyg = Number(row.amount)
    if (typeof row.amount !== 'number' || !Number.isSafeInteger(amountPyg) || amountPyg <= 0) throw new InputError(`El monto del pago ${index + 1} debe ser un entero positivo en guaraníes.`)
    if (row.toDriver !== undefined && typeof row.toDriver !== 'boolean') throw new InputError('toDriver debe ser true o false.')
    return { accountId, amountPyg, toDriver: row.toDriver === true }
  })
  return { reason, rows }
}

/** Los pagos nuevos deben sumar exactamente el original. */
export function assertSplitMatches(originalPyg: number, rows: Array<{ amountPyg: number }>) {
  const total = rows.reduce((sum, row) => sum + row.amountPyg, 0)
  if (!Number.isSafeInteger(total) || total !== originalPyg) {
    throw new InputError(`Los pagos nuevos deben sumar exactamente ${originalPyg.toLocaleString('es-PY')} Gs. (suman ${total.toLocaleString('es-PY')}).`)
  }
}

type OriginalLike = { method: string; status: string; amountPyg: bigint | number; currency: string | null; dueAt: Date | null; reversalOfId: string | null; correctionId: string | null }

/** Motivo por el que v1 no admite corregir este pago (422) o ya no corresponde (409). */
export function correctionBlock(original: OriginalLike, hasReversal: boolean): { status: 409 | 422; message: string } | null {
  if (original.reversalOfId || original.correctionId || hasReversal) return { status: 409, message: 'Este pago ya fue corregido.' }
  if (original.status !== 'CONFIRMED') return { status: 409, message: 'Solo se corrigen pagos confirmados.' }
  if ((UNSUPPORTED_METHODS as readonly string[]).includes(original.method)) return { status: 422, message: 'Este medio de pago no se puede corregir todavía (trade-in, saldo a favor, gift card, crédito o cripto).' }
  if (original.dueAt) return { status: 422, message: 'Las cuotas no se pueden corregir.' }
  if (original.currency && original.currency !== 'PYG') return { status: 422, message: 'Solo se corrigen pagos en guaraníes.' }
  if (numero(original.amountPyg) <= 0) return { status: 409, message: 'Este pago no tiene un monto corregible.' }
  return null
}

/** Efecto de la corrección sobre el efectivo según el turno de origen del pago. */
export function drawerFlags(originSessionOpen: boolean) {
  return { originSessionClosed: !originSessionOpen, drawerImpact: originSessionOpen ? true : CLOSED_SHIFT_AFFECTS_DRAWER }
}

export type PaymentCorrectionResult = {
  replayed: boolean
  correction: { id: string; orderId: string; reason: string; originSessionClosed: boolean; drawerImpact: boolean; before: unknown; after: unknown; createdAt: Date }
  reversal: Prisma.PaymentGetPayload<Record<string, never>>
  payments: Array<Prisma.PaymentGetPayload<Record<string, never>>>
}

type Actor = { id: string; role: string; branchId: string | null }

/**
 * Aplica la corrección dentro de una transacción. Bloquea pedido y pago
 * (FOR UPDATE), así dos correcciones simultáneas se serializan y la segunda ve
 * la reversión de la primera (409). La misma Idempotency-Key devuelve el
 * resultado original sin escribir nada.
 */
export async function applyPaymentCorrection(tx: Prisma.TransactionClient, input: {
  tenantId: string; actor: Actor; orderId: string; paymentId: string; idempotencyKey: string; reason: string; rows: CorrectionRowInput[]
}): Promise<PaymentCorrectionResult> {
  const { tenantId, actor, orderId, paymentId, idempotencyKey, reason, rows } = input
  const locked = await tx.$queryRaw<Array<{ id: string; branchId: string | null; sellerId: string; status: string; totalPyg: bigint | number; assignedToId: string | null; orderNumber: string }>>`
    SELECT "id", "branchId", "sellerId", "status"::text AS "status", "totalPyg", "assignedToId", "orderNumber" FROM "Order" WHERE "id" = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`
  const order = locked[0]
  if (!order || !canAccessOrder(actor, order)) throw new InputError('Pedido no encontrado.', 404)
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} AND "orderId" = ${order.id} AND "tenantId" = ${tenantId} FOR UPDATE`
  const original = await tx.payment.findFirst({ where: { id: paymentId, orderId: order.id, tenantId }, include: { reconciliation: { select: { state: true, batchId: true } } } })
  if (!original) throw new InputError('Pago no encontrado.', 404)

  // Reintento con la misma clave: devuelve la corrección ya aplicada.
  const previous = await tx.paymentCorrection.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } })
  if (previous) {
    const sameTarget = previous.orderId === order.id && (previous.before as { paymentId?: string } | null)?.paymentId === original.id
    if (!sameTarget) throw new InputError('El identificador ya pertenece a otra corrección.', 409)
    const rowsOfCorrection = await tx.payment.findMany({ where: { tenantId, correctionId: previous.id }, orderBy: { createdAt: 'asc' } })
    const reversal = rowsOfCorrection.find(row => row.reversalOfId === original.id)
    if (!reversal) throw new InputError('La corrección previa está incompleta.', 409)
    return { replayed: true, correction: previous, reversal, payments: rowsOfCorrection.filter(row => row.id !== reversal.id) }
  }

  // Turno de origen: el del responsable del cobro que contenía la hora del pago.
  const collector = original.userId ?? original.createdById
  const originSession = collector && order.branchId
    ? await tx.cashSession.findFirst({
        where: { tenantId, branchId: order.branchId, openedById: collector, openedAt: { lte: original.paidAt }, OR: [{ closedAt: null }, { closedAt: { gte: original.paidAt } }] },
        orderBy: { openedAt: 'desc' },
        select: { status: true, closedAt: true },
      })
    : null
  const originSessionOpen = !!originSession && originSession.status === 'OPEN' && originSession.closedAt === null

  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  const decision = canCorrectPayment(actor, {
    userId: original.userId, createdById: original.createdById,
    reconciliationState: original.reconciliation?.state ?? null, originSessionOpen,
  }, { permissions: { staffCorrectsPayments: staffCorrectsPaymentsFrom(tenant?.settings) } })
  if (!decision.allowed) throw new InputError(decision.message, 403)

  if (order.status === 'CANCELLED') throw new InputError('El pedido está anulado: no admite correcciones.', 409)
  if (original.reconciliation?.batchId) throw new InputError('El pago ya está incluido en un lote de conciliación: no se puede corregir.', 409)
  const reversalExists = await tx.payment.findFirst({ where: { tenantId, reversalOfId: original.id }, select: { id: true } })
  const block = correctionBlock(original, !!reversalExists)
  if (block) throw new InputError(block.message, block.status)

  const originalPyg = numero(original.amountPyg)
  assertSplitMatches(originalPyg, rows)

  // Cada fila nueva se normaliza con el mismo código de un cobro común (cuenta
  // activa del negocio, medio derivado de la cuenta, PYG a cotización 1).
  const prepared = []
  for (const [index, row] of rows.entries()) {
    const account = await tx.paymentAccount.findFirst({ where: { id: row.accountId, tenantId, isActive: true }, select: { currency: true, kind: true } })
    if (!account) throw new InputError(`La cuenta del pago ${index + 1} no existe o está inactiva.`, 409)
    if (account.currency !== 'PYG') throw new InputError(`El pago ${index + 1} debe ser en guaraníes.`, 422)
    const normalized = await normalizePayment(tx, tenantId, { accountId: row.accountId, originalAmount: row.amountPyg, status: row.toDriver ? 'PENDING' : 'CONFIRMED' })
    if (normalized.currency && normalized.currency !== 'PYG') throw new InputError(`El pago ${index + 1} debe ser en guaraníes.`, 422)
    if ((UNSUPPORTED_METHODS as readonly string[]).includes(normalized.method)) throw new InputError(`El pago ${index + 1} usa un medio que no admite correcciones (${normalized.method}).`, 422)
    if (row.toDriver) {
      if (normalized.method !== 'CASH') throw new InputError('Solo el efectivo puede quedar en poder del repartidor.', 422)
      if (!order.assignedToId) throw new InputError('El pedido no tiene repartidor asignado para recibir ese efectivo.', 422)
    }
    prepared.push({ row, normalized })
  }
  if (prepared.length === 1 && !prepared[0].row.toDriver && original.accountId && prepared[0].normalized.accountId === original.accountId) {
    throw new InputError('El pago nuevo es igual al original: elegí otro medio o cuenta.')
  }

  const originalSnapshot = (original.accountSnapshot && typeof original.accountSnapshot === 'object' && !Array.isArray(original.accountSnapshot) ? original.accountSnapshot : {}) as Record<string, unknown>
  const before = { paymentId: original.id, method: original.method, accountId: original.accountId, accountName: (originalSnapshot.name as string | undefined) ?? null, amountPyg: originalPyg, status: original.status }
  const after = prepared.map(({ row, normalized }) => ({
    method: normalized.method, accountId: normalized.accountId ?? null,
    accountName: ((normalized.accountSnapshot as Record<string, unknown> | undefined)?.name as string | undefined) ?? null,
    amountPyg: row.amountPyg, toDriver: row.toDriver,
  }))
  const flags = drawerFlags(originSessionOpen)
  const now = new Date()

  const correction = await tx.paymentCorrection.create({
    data: { tenantId, branchId: order.branchId, orderId: order.id, reason, createdById: actor.id, idempotencyKey, before, after, ...flags },
  })
  const reversal = await tx.payment.create({
    data: {
      tenantId, orderId: order.id, correctionId: correction.id, reversalOfId: original.id,
      method: original.method, status: 'CONFIRMED', amountPyg: -originalPyg,
      accountId: original.accountId, ...(original.accountSnapshot ? { accountSnapshot: original.accountSnapshot as Prisma.InputJsonObject } : {}),
      // originalAmount queda positivo: el CHECK Payment_account_snapshot_check lo exige con cuenta; el signo vive en amountPyg.
      currency: original.currency, originalAmount: original.originalAmount, exchangeRatePyg: original.exchangeRatePyg,
      reference: original.reference, userId: original.userId, createdById: original.createdById,
      idempotencyKey: `${idempotencyKey}${REVERSAL_SUFFIX}`, paidAt: now,
    },
  })
  const created = []
  for (const [index, { row, normalized }] of prepared.entries()) {
    const { tradeIn: _tradeIn, giftCard: _giftCard, ...data } = normalized
    const payment = await tx.payment.create({
      data: {
        ...data, tenantId, orderId: order.id, correctionId: correction.id,
        userId: original.userId, createdById: original.createdById, idempotencyKey: `${idempotencyKey}:n${index}`, paidAt: now,
        ...(row.toDriver ? { deliveryUserId: order.assignedToId, collectedAt: now } : {}),
      },
    })
    // La transferencia nueva queda por conciliar como cualquier cobro por transferencia.
    if (normalized.method === 'TRANSFER' && !row.toDriver) {
      await tx.paymentReconciliation.create({ data: { tenantId, paymentId: payment.id, state: 'PENDING' } })
    }
    created.push(payment)
  }

  // Efectivo que pasa al repartidor deja de contar como confirmado hasta su
  // rendición: si el pedido quedaba saldado, vuelve a pendiente (como un cobro de calle).
  let reopened = false
  if (order.status === 'COMPLETED') {
    const confirmed = await tx.payment.aggregate({ where: { tenantId, orderId: order.id, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
    if (numero(confirmed._sum.amountPyg) < numero(order.totalPyg)) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PENDING' } })
      reopened = true
    }
  }

  await tx.auditLog.create({ data: {
    tenantId, userId: actor.id, action: 'ORDER_PAYMENT_CORRECTED', entity: 'Order', entityId: order.id,
    metadata: { correctionId: correction.id, paymentId: original.id, orderNumber: order.orderNumber, reason, before, after, originSessionClosed: flags.originSessionClosed, drawerImpact: flags.drawerImpact, orderReopened: reopened },
  } })
  return { replayed: false, correction, reversal, payments: created }
}
