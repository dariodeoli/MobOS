import { prisma } from '../../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../../lib/http'
import { requireSession } from '../../../../../../../lib/auth'
import { InputError } from '../../../../../../../lib/payment-input'
import { applyPaymentCorrection, parseCorrectionBody } from '../../../../../../../lib/payment-corrections'
import { canEverCorrectPayments } from '../../../../../../../lib/payment-correction-policy'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'

// Corrige el medio de un pago ya cobrado (#393): reversión + pagos nuevos que
// suman lo mismo. Ver lib/payment-corrections.ts para las reglas de dinero y
// lib/payment-correction-policy.ts para quién puede.
export async function POST(request: Request, context: { params: Promise<{ orderId: string; paymentId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canEverCorrectPayments(session.user.role)) return error('Tu rol no puede corregir pagos.', 403)
  const limited = enforceRateLimit(request, 'payment-correction', 60, 60_000)
  if (limited) return limited
  const idempotencyKey = request.headers.get('Idempotency-Key') || ''
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Falta el identificador de operación (Idempotency-Key de 16 a 100 caracteres).')
  try {
    const { orderId, paymentId } = await context.params
    const { reason, rows } = parseCorrectionBody(await request.json().catch(() => { throw new InputError('JSON inválido.') }))
    const result = await prisma.$transaction(tx => applyPaymentCorrection(tx, {
      tenantId: tenant, actor: { id: session.user.id, role: session.user.role, branchId: session.user.branchId }, orderId, paymentId, idempotencyKey, reason, rows,
    }))
    const { replayed, ...body } = result
    return json({ ...body, replayed }, { status: replayed ? 200 : 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if ((cause as { code?: string })?.code === 'P2002') return error('La corrección se está procesando o ya fue aplicada. Reintentá con la misma clave.', 409)
    console.error('[orders/payments/correction] no se pudo corregir el pago:', cause)
    return error('No se pudo corregir el pago.', 500)
  }
}
