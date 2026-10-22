import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { numero } from '../../../../lib/montos'
import { accountLabelOf, bankOf, holderOf, processorOf, snapshotText } from '../../../../lib/reconciliation'
import { loadPaymentVerificationPolicy } from '../../../../lib/payment-verification'
import { canResolvePayment, canViewVerification, verificationOrderScope } from '../../../../lib/payment-verification-scope'

// Pagos por verificar: cobros PIX, USDT o transferencia que esperan aprobación
// (Payment.pendingReason = VERIFICACION). `state` = pending (por verificar),
// approved (aprobados), rejected (rechazados, con su motivo) o all. El vendedor
// solo ve los de sus pedidos; quien verifica ve su sucursal (el administrador, toda
// la empresa). Los montos son guaraníes completos.

const STATES = { pending: 'PENDING', approved: 'CONFIRMED', rejected: 'REJECTED' } as const
const MAX_LIMIT = 200

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canViewVerification(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const state = (params.get('state') || 'pending').toLowerCase()
  if (state !== 'all' && !(state in STATES)) return error('state debe ser pending, approved, rejected o all.')
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 100))
  const tenantId = session.user.tenantId
  const orderScope = verificationOrderScope(session, params.get('branchId'))
  if (!orderScope) return error('No autorizado.', 403)

  const base: Prisma.PaymentWhereInput = { tenantId, pendingReason: 'VERIFICACION', reversalOfId: null, order: orderScope }
  const [rows, grouped, policy] = await Promise.all([
    prisma.payment.findMany({
      where: { ...base, ...(state === 'all' ? {} : { status: STATES[state as keyof typeof STATES] }) },
      orderBy: state === 'pending' ? { createdAt: 'asc' } : { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, orderId: true, method: true, status: true, amountPyg: true, currency: true, originalAmount: true, reference: true,
        accountId: true, accountSnapshot: true, createdAt: true, paidAt: true, createdById: true, userId: true, deliveryUserId: true, pendingReason: true,
        createdBy: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true, branchId: true, sellerId: true, totalPyg: true, customer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } } } },
        proofs: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        reconciliation: { select: { state: true, note: true, resolvedVia: true, resolvedAt: true, verifiedBy: { select: { id: true, name: true } } } },
      },
    }),
    prisma.payment.groupBy({ by: ['status'], where: { ...base, status: { in: ['PENDING', 'CONFIRMED', 'REJECTED'] } }, _count: { _all: true }, _sum: { amountPyg: true } }),
    loadPaymentVerificationPolicy(prisma, tenantId),
  ])
  const counts = { pending: { count: 0, amountPyg: 0 }, approved: { count: 0, amountPyg: 0 }, rejected: { count: 0, amountPyg: 0 } }
  for (const group of grouped) {
    const key = group.status === 'PENDING' ? 'pending' : group.status === 'CONFIRMED' ? 'approved' : 'rejected'
    counts[key] = { count: group._count._all, amountPyg: numero(group._sum.amountPyg) }
  }
  const now = Date.now()
  const items = rows.map(row => {
    const view = { id: row.id, accountSnapshot: row.accountSnapshot, accountId: row.accountId, method: row.method, account: null }
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      branchId: row.order.branchId,
      customerName: row.order.customer?.name ?? null,
      sellerId: row.order.sellerId,
      sellerName: row.order.seller?.name ?? null,
      collectedById: row.createdById ?? row.userId,
      collectedByName: row.createdBy?.name ?? row.order.seller?.name ?? null,
      method: row.method,
      status: row.status,
      pendingReason: row.pendingReason,
      amountPyg: numero(row.amountPyg),
      currency: row.currency,
      originalAmount: row.originalAmount?.toString() ?? null,
      reference: row.reference,
      accountId: row.accountId,
      account: {
        name: accountLabelOf(view as never), bank: bankOf(view as never) || null, holder: holderOf(view as never) || null, processor: processorOf(view as never) || null,
        alias: snapshotText(row.accountSnapshot, 'aliasValue') || null, pixKey: snapshotText(row.accountSnapshot, 'pixKey') || null,
      },
      createdAt: row.createdAt.toISOString(),
      ageMinutes: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 60000)),
      proofs: row.proofs,
      proofCount: row.proofs.length,
      resolution: row.reconciliation ? {
        state: row.reconciliation.state, note: row.reconciliation.note, via: row.reconciliation.resolvedVia,
        at: row.reconciliation.resolvedAt?.toISOString() ?? null, byId: row.reconciliation.verifiedBy?.id ?? null, byName: row.reconciliation.verifiedBy?.name ?? null,
      } : null,
      canResolve: row.status === 'PENDING' && canResolvePayment(session.user.role, session.user.id, row, policy),
    }
  })
  return json({ state, items, counts, policy: { requireProof: policy.requireProof, blockDelivery: policy.blockDelivery } }, { headers: { 'Cache-Control': 'no-store' } })
}
