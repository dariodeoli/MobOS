import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { InputError } from '../../../../lib/payment-input'
import { quotePromotion } from '../../../../lib/promotions'

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  try {
    const body = await request.json()
    return json(await prisma.$transaction(tx => quotePromotion(tx, session.user.tenantId, session.user.branchId, body)))
  } catch (e) { return error(e instanceof InputError ? e.message : 'No se pudo validar el cupón.', e instanceof InputError ? e.status : 400) }
}
