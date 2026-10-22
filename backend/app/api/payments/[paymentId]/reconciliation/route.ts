import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { findAccessiblePayment, normalizeReconciliationNote, RECONCILIATION_ROLES } from '../../_lib'
import { lockPaymentRow } from '../../../../../lib/reconciliation'
import { InputError } from '../../../../../lib/payment-input'
import { loadPaymentVerificationPolicy, notifyPaymentResolved, resolvePaymentVerification } from '../../../../../lib/payment-verification'

type RouteContext = { params: Promise<{ paymentId: string }> }

export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)

  const reconciliation = await prisma.paymentReconciliation.findUnique({
    where: { paymentId: payment.id },
    select: { id: true, paymentId: true, state: true, note: true, createdAt: true, updatedAt: true, resolvedVia: true, resolvedAt: true, verifiedBy: { select: { id: true, name: true, role: true } } },
  })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_RECONCILIATION_VIEWED', entity: 'Payment', entityId: payment.id, metadata: { state: reconciliation?.state ?? 'PENDING' } } })
  return json(reconciliation ?? { paymentId: payment.id, state: 'PENDING', note: null, verifiedBy: null, createdAt: null, updatedAt: null })
}

export async function PATCH(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!RECONCILIATION_ROLES.includes(session.user.role as (typeof RECONCILIATION_ROLES)[number])) return error('No autorizado para conciliar pagos.', 403)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)
  // Un gerente de sucursal solo resuelve los pagos de su sucursal.
  if (session.user.role === 'GERENTE' && session.user.branchId && payment.order.branchId !== session.user.branchId) return error('Pago no encontrado.', 404)

  let body: { state?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return error('JSON inválido.')
  }
  if (body.state !== 'VERIFIED' && body.state !== 'REJECTED') return error('state debe ser VERIFIED o REJECTED.')
  const state = body.state

  let note: string | null
  try {
    note = normalizeReconciliationNote(body.note)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'note inválida.')
  }
  if (state === 'REJECTED' && !note) return error('Indicá el motivo del rechazo.', 400)

  try {
    const tenantId = session.user.tenantId
    const actor = { id: session.user.id, name: session.user.name, role: session.user.role }
    const outcome = await prisma.$transaction(async tx => {
      const row = await lockPaymentRow(tx, tenantId, payment.id)
      if (!row) return null
      // Original corregido y su reversión salen de la conciliación (#393).
      const par = await tx.payment.findFirst({ where: { tenantId, OR: [{ id: payment.id, reversalOfId: { not: null } }, { reversalOfId: payment.id }] }, select: { id: true } })
      if (par) return 'CORREGIDO' as const
            const policy = await loadPaymentVerificationPolicy(tx, tenantId)
      // Aprobar o rechazar: mismas reglas que el panel y la verificación diaria (no-op, 409 si ya está resuelto, motivo, pago propio).
      const resolved = await resolvePaymentVerification(tx, { tenantId, actor, row, state, note, policy })
      return { ...resolved, wasPending: row.status === 'PENDING', pendingReason: row.pendingReason }
    })
    if (!outcome) return error('Pago no encontrado.', 404)
    if (outcome === 'CORREGIDO') return error('Este pago fue corregido: conciliá el pago nuevo.', 409)
    if (outcome.outcome === 'changed' && outcome.wasPending) await notifyPaymentResolved({ tenantId, paymentId: payment.id, orderId: payment.orderId, sellerId: payment.order.sellerId, approved: state === 'VERIFIED' })
    return json(outcome.reconciliation)
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    throw cause
  }
}
