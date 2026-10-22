import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from './prisma'
import { InputError } from './payment-input'
import { confirmReconciledPayment, type LockedPaymentRow } from './reconciliation'
import {
  PAYMENT_VERIFIER_ROLES,
  effectivePendingReason,
  isOwnPayment,
  mayApproveOwnPayment,
  parsePaymentVerification,
  type PaymentVerificationPolicy,
} from './payment-verification-policy'
import { enviarWebPush } from './web-push'
import { logError } from './log'

// Verificación de pagos: aprobar o rechazar un cobro que quedó PENDING con
// motivo VERIFICACION (PIX, USDT, transferencia según la política de la
// empresa). El PATCH de conciliación, el lote del día y el panel «Pagos por
// verificar» pasan por acá: las reglas son las mismas en todos los caminos.

type Db = Prisma.TransactionClient | typeof prisma
export type PaymentActor = { id: string; name: string; role: string }

export async function loadPaymentVerificationPolicy(db: Db, tenantId: string): Promise<PaymentVerificationPolicy> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  return parsePaymentVerification(tenant?.settings)
}

/** Roles que pueden aprobar lo propio (crédito y pagos). Sin configuración: ninguno, ni el administrador. */
export async function selfApproveRolesFor(db: Db, tenantId: string): Promise<string[]> {
  return (await loadPaymentVerificationPolicy(db, tenantId)).selfApproveRoles
}

export const canActAsVerifier = (role: string) => (PAYMENT_VERIFIER_ROLES as readonly string[]).includes(role)

const RECONCILIATION_SELECT = { id: true, paymentId: true, state: true, note: true, createdAt: true, updatedAt: true, resolvedVia: true, resolvedAt: true, verifiedBy: { select: { id: true, name: true, role: true } } } as const

export type PaymentResolution = {
  outcome: 'changed' | 'noop'
  reconciliation: { id: string; paymentId: string; state: string; note: string | null; createdAt: Date; updatedAt: Date; resolvedVia: string | null; resolvedAt: Date | null; verifiedBy: { id: string; name: string; role: string } | null }
}

/**
 * Aprueba (VERIFIED) o rechaza (REJECTED) un pago, con la fila ya bloqueada
 * (`lockPaymentRow`). Reglas:
 *  - mismo estado que ya tiene = no-op (idempotente);
 *  - un pago resuelto no se reabre ni cambia de resultado (409);
 *  - rechazar exige motivo;
 *  - quien creó o cobró el pago no lo aprueba, salvo rol en `selfApproveRoles`;
 *  - con `requireProof`, un pago por verificar necesita al menos un comprobante.
 * Al aprobar, `paidAt` pasa a ser la fecha de aprobación.
 */
export async function resolvePaymentVerification(tx: Prisma.TransactionClient, input: {
  tenantId: string; actor: PaymentActor; row: LockedPaymentRow; state: 'VERIFIED' | 'REJECTED'; note: string | null
  policy: PaymentVerificationPolicy; batchId?: string | null
}): Promise<PaymentResolution> {
  const { tenantId, actor, row, state, policy } = input
  const note = input.note?.trim() || null
  const existing = await tx.paymentReconciliation.findUnique({ where: { paymentId: row.id }, select: RECONCILIATION_SELECT })
  if (existing && existing.state === state) return { outcome: 'noop', reconciliation: existing }
  if (existing && existing.state !== 'PENDING') throw new InputError('El pago ya fue resuelto: no se puede cambiar el resultado.', 409)
  if (row.status === 'REFUNDED') throw new InputError('El pago fue devuelto: no admite verificación.', 409)
  if (row.status === 'REJECTED' && state === 'VERIFIED') throw new InputError('El pago ya fue rechazado: el cliente tiene que pagar de nuevo.', 409)
  if (row.status === 'CONFIRMED' && state === 'REJECTED') throw new InputError('El pago ya está aprobado: registrá una discrepancia o corregí el medio de pago.', 409)
  if (row.status === 'PENDING' && (row.deliveryUserId || row.deliverySettlementId)) throw new InputError('Los cobros pendientes de reparto se verifican mediante su rendición.', 409)
  if (state === 'REJECTED' && !note) throw new InputError('Indicá el motivo del rechazo.', 400)

  let via = 'PANEL'
  if (state === 'VERIFIED') {
    const own = isOwnPayment(row, actor.id)
    if (own && !mayApproveOwnPayment(policy, actor.role)) throw new InputError('No podés aprobar un pago que registraste vos: tiene que aprobarlo otra persona.', 403)
    if (own) via = 'SELF'
    if (row.status === 'PENDING' && effectivePendingReason(row.pendingReason) === 'VERIFICACION' && policy.requireProof) {
      const proofs = await tx.paymentProof.count({ where: { tenantId, paymentId: row.id } })
      if (!proofs) throw new InputError('Falta el comprobante del pago: subilo antes de aprobar.', 409)
    }
  }

  const now = new Date()
  const reconciliation = await tx.paymentReconciliation.upsert({
    where: { paymentId: row.id },
    create: { tenantId, paymentId: row.id, state, note, verifiedById: actor.id, resolvedVia: via, resolvedAt: now, ...(input.batchId ? { batchId: input.batchId } : {}) },
    update: { state, note, verifiedById: actor.id, resolvedVia: via, resolvedAt: now, ...(input.batchId ? { batchId: input.batchId } : {}) },
    select: RECONCILIATION_SELECT,
  })
  await confirmReconciledPayment(tx, { tenantId, userId: actor.id, row, state, note, via })
  await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_RECONCILIATION_UPDATED', entity: 'PaymentReconciliation', entityId: reconciliation.id, metadata: { paymentId: row.id, state, note, via } } })
  if (via === 'SELF') await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_SELF_APPROVED', entity: 'Payment', entityId: row.id, metadata: { orderId: row.orderId, amountPyg: row.amountPyg, method: row.method, role: actor.role } } })
  return { outcome: 'changed', reconciliation }
}

/**
 * Rastro de un pago recién creado según la política: PENDING/VERIFICACION deja
 * `PAYMENT_VERIFICATION_REQUESTED` (y la fila de conciliación en PENDING); uno
 * aprobado por un rol autorizado a aprobar lo propio queda VERIFIED por SELF.
 */
export async function recordPaymentVerificationStart(tx: Prisma.TransactionClient, input: {
  tenantId: string; actor: PaymentActor; payment: { id: string; orderId: string; method: string; amountPyg: bigint | number; status: string; pendingReason: string | null }; selfApproved: boolean
}) {
  const { tenantId, actor, payment } = input
  if (payment.pendingReason !== 'VERIFICACION') return
  const metadata = { orderId: payment.orderId, amountPyg: Number(payment.amountPyg), method: payment.method }
  await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_VERIFICATION_REQUESTED', entity: 'Payment', entityId: payment.id, metadata: { ...metadata, selfApproved: input.selfApproved } } })
  if (input.selfApproved) {
    const now = new Date()
    await tx.paymentReconciliation.upsert({
      where: { paymentId: payment.id },
      create: { tenantId, paymentId: payment.id, state: 'VERIFIED', verifiedById: actor.id, resolvedVia: 'SELF', resolvedAt: now },
      update: { state: 'VERIFIED', verifiedById: actor.id, resolvedVia: 'SELF', resolvedAt: now },
    })
    await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'PAYMENT_SELF_APPROVED', entity: 'Payment', entityId: payment.id, metadata: { ...metadata, role: actor.role } } })
  } else {
    await tx.paymentReconciliation.upsert({ where: { paymentId: payment.id }, create: { tenantId, paymentId: payment.id, state: 'PENDING' }, update: {} })
  }
}

/** ¿El pedido tiene un cobro esperando verificación? Si la política bloquea la entrega, no sale. */
export async function assertNoPaymentInVerification(db: Db, tenantId: string, orderId: string, policy?: PaymentVerificationPolicy) {
  const pending = await db.payment.count({ where: { tenantId, orderId, status: 'PENDING', pendingReason: 'VERIFICACION' } })
  if (!pending) return
  const effective = policy ?? await loadPaymentVerificationPolicy(db, tenantId)
  if (!effective.blockDelivery) return
  throw new InputError('Pago en verificación: el pedido no se entrega hasta que se apruebe el cobro.', 409)
}

/** Aviso a quien verifica: campana (derivada de los pagos) + Web Push genérico. Nunca lanza. */
export async function notifyPaymentToVerify(input: { tenantId: string; paymentId: string; orderId: string; branchId: string | null }) {
  try {
    const destinatarios = await prisma.user.findMany({
      where: { tenantId: input.tenantId, status: 'ACTIVE', role: { in: [...PAYMENT_VERIFIER_ROLES] as UserRole[] }, OR: [{ role: 'ADMIN' }, { branchId: null }, ...(input.branchId ? [{ branchId: input.branchId }] : [])] },
      select: { id: true },
    })
    for (const destinatario of destinatarios) {
      await enviarWebPush({ tenantId: input.tenantId, userId: destinatario.id, titulo: 'Pago por verificar', cuerpo: 'Hay un cobro esperando aprobación. Abrí MobOS para verificarlo.', url: '/autorizaciones', tag: `pago-verificar-${input.paymentId}`, urgente: true })
    }
  } catch (cause) {
    logError('pagos: no se pudo avisar por push', { paymentId: input.paymentId, error: cause instanceof Error ? cause.message : String(cause) })
  }
}

/** Aviso al vendedor: su cobro fue aprobado o rechazado. Nunca lanza. */
export async function notifyPaymentResolved(input: { tenantId: string; paymentId: string; orderId: string; sellerId: string | null; approved: boolean }) {
  if (!input.sellerId) return
  try {
    await enviarWebPush({ tenantId: input.tenantId, userId: input.sellerId, titulo: input.approved ? 'Pago aprobado' : 'Pago rechazado', cuerpo: input.approved ? 'Tu cobro fue aprobado.' : 'Tu cobro fue rechazado. Abrí MobOS para cobrar de nuevo.', url: `/pedidos/${input.orderId}`, tag: `pago-resuelto-${input.paymentId}`, urgente: !input.approved })
  } catch (cause) {
    logError('pagos: no se pudo avisar la resolución por push', { paymentId: input.paymentId, error: cause instanceof Error ? cause.message : String(cause) })
  }
}
