import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { loadPaymentVerificationPolicy } from '../../../../../lib/payment-verification'

// Política de verificación de pagos de la empresa, para que el cobro del POS
// sepa qué medios piden comprobante antes de confirmar. Es de solo lectura y no
// trae datos de personas ni montos: cualquier sesión de la empresa la puede leer.
// El servidor sigue decidiendo el estado de cada pago (esto solo presenta).
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const policy = await loadPaymentVerificationPolicy(prisma, session.user.tenantId)
  return json({
    methods: policy.methods,
    accounts: policy.accounts,
    requireProof: policy.requireProof,
    blockDelivery: policy.blockDelivery,
  })
}
