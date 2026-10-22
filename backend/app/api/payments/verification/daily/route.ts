import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession, type SessionContext } from '../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../lib/payment-input'
import { ensureStoreBranch } from '../../../../../lib/store-branch'
import { loadPaymentVerificationPolicy } from '../../../../../lib/payment-verification'
import { PAYMENT_VERIFIER_ROLES } from '../../../../../lib/payment-verification-policy'
import { dailyVerificationView, recordDayDiscrepancy, resolveDayDiscrepancy, verifyDayPayments, type VerifyScope } from '../../../../../lib/payment-verification-day'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

// Verificación diaria de pagos (Finanzas › Verificación).
//   GET  ?day=YYYY-MM-DD[&branchId=]  → total del día por medio y cuenta con el detalle por pedido,
//                                       estado del día (OPEN | VERIFIED | DISCREPANCIES) y diferencias.
//   POST { day, branchId?, action }   → verify-all · verify-category · verify-one ·
//                                       discrepancy · resolve-discrepancy  (todas idempotentes).
// Solo ADMIN, GERENTE y CAJERA; cada uno dentro de su sucursal (el administrador elige).

async function scope(request: Request, requestedBranchId: string | null) {
  const session = await requireSession(request)
  if (!session) return { status: 401 as const }
  if (!(PAYMENT_VERIFIER_ROLES as readonly string[]).includes(session.user.role)) return { status: 403 as const }
  let branchId: string | null = session.user.role === 'ADMIN' ? requestedBranchId : session.user.branchId ?? (session.user.role === 'GERENTE' ? requestedBranchId : null)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE' && !branchId) branchId = await ensureStoreBranch(session)
  if (!branchId) return { status: 400 as const }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
  if (!branch) return { status: 403 as const }
  return { session: session as SessionContext, branchId }
}

const failure = (status: 400 | 401 | 403) => status === 401 ? error('Falta sesión.', 401) : status === 403 ? error('No autorizado.', 403) : error('Elegí una sucursal para verificar el día.')

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const ctx = await scope(request, params.get('branchId'))
  if ('status' in ctx) return failure(ctx.status as 400 | 401 | 403)
  try {
    const { session, branchId } = ctx
    const policy = await loadPaymentVerificationPolicy(prisma, session.user.tenantId)
    const actor = { id: session.user.id, name: session.user.name, role: session.user.role }
    return json(await dailyVerificationView(prisma, { tenantId: session.user.tenantId, branchId, day: params.get('day') || '', actor, policy }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo cargar la verificación del día.', cause instanceof InputError ? cause.status : 400)
  }
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'payment-day-verification', 60, 60_000)
  if (limited) return limited
  try {
    const body = objectInput(await request.json())
    const ctx = await scope(request, typeof body.branchId === 'string' && body.branchId ? body.branchId : null)
    if ('status' in ctx) return failure(ctx.status as 400 | 401 | 403)
    const { session, branchId } = ctx
    const tenantId = session.user.tenantId
    const actor = { id: session.user.id, name: session.user.name, role: session.user.role }
    const day = typeof body.day === 'string' ? body.day : ''
    const action = String(body.action || '')
    if (action === 'verify-all' || action === 'verify-category' || action === 'verify-one') {
      let verifyScope: VerifyScope
      if (action === 'verify-all') verifyScope = { kind: 'ALL' }
      else if (action === 'verify-one') {
        if (typeof body.paymentId !== 'string' || !body.paymentId) throw new InputError('paymentId es obligatorio.')
        verifyScope = { kind: 'ONE', paymentId: body.paymentId }
      } else {
        if (typeof body.method !== 'string' || !body.method) throw new InputError('method es obligatorio.')
        verifyScope = { kind: 'CATEGORY', method: body.method, accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : null, currency: typeof body.currency === 'string' && body.currency ? body.currency : 'PYG' }
      }
      const policy = await loadPaymentVerificationPolicy(prisma, tenantId)
      const result = await verifyDayPayments({ tenantId, branchId, day, actor, policy, scope: verifyScope })
      const view = await dailyVerificationView(prisma, { tenantId, branchId, day, actor, policy })
      return json({ result, day: { state: view.state, unresolved: view.unresolved, openDiscrepancies: view.openDiscrepancies, totals: view.totals } })
    }
    if (action === 'discrepancy') {
      const outcome = await recordDayDiscrepancy({
        tenantId, branchId, day, actor, scope: body.scope as 'LINE' | 'CATEGORY', paymentId: typeof body.paymentId === 'string' ? body.paymentId : null,
        method: typeof body.method === 'string' ? body.method : null, accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : null,
        currency: typeof body.currency === 'string' ? body.currency : null, receivedPyg: body.receivedPyg as number, reason: body.reason as string,
        requestId: typeof body.requestId === 'string' ? body.requestId : null,
      })
      return json({ discrepancy: { ...outcome.discrepancy, expectedPyg: Number(outcome.discrepancy.expectedPyg), receivedPyg: Number(outcome.discrepancy.receivedPyg) }, created: outcome.created }, { status: outcome.created ? 201 : 200 })
    }
    if (action === 'resolve-discrepancy') {
      if (typeof body.discrepancyId !== 'string' || !body.discrepancyId) throw new InputError('discrepancyId es obligatorio.')
      return json(await resolveDayDiscrepancy({ tenantId, branchId, actor, discrepancyId: body.discrepancyId, note: typeof body.note === 'string' ? body.note : null }))
    }
    throw new InputError('Acción inválida.')
  } catch (cause) {
    if (cause instanceof SyntaxError) return error('JSON inválido.')
    return error(cause instanceof Error ? cause.message : 'No se pudo verificar el día.', cause instanceof InputError ? cause.status : 409)
  }
}
