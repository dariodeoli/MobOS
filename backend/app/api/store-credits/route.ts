import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

const INT_MAX = 2147483647

// Saldo a favor del cliente (nota de crédito interna): consulta y emisión
// manual. Las devoluciones también lo emiten; acá además gerencia puede
// cargar un crédito de cortesía con su motivo.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['orders:manage', 'orders:own', 'orders:branch', 'payments:manage'])) return error('No autorizado.', 403)
  const customerId = new URL(request.url).searchParams.get('customerId')
  const where = { tenantId: tenant, remainingPyg: { gt: 0 }, ...(customerId ? { customerId } : {}) }
  const credits = await prisma.storeCredit.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, customerId: true, orderId: true, amountPyg: true, remainingPyg: true, note: true, createdAt: true, customer: { select: { name: true } } },
  })
  const availablePyg = credits.reduce((sum, credit) => sum + credit.remainingPyg, 0)
  return json({ customerId: customerId || null, availablePyg, credits })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['orders:manage'])) return error('Solo administración o gerencia emiten saldo a favor.', 403)
  try {
    const body = objectInput(await request.json())
    const customerId = textInput(body.customerId, 'customerId', 200)
    const amountPyg = Number(body.amountPyg)
    if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0 || amountPyg > INT_MAX) throw new InputError('El monto debe ser un entero positivo.')
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Motivo', 300)
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
    if (!customer) throw new InputError('Cliente no encontrado.', 404)
    const credit = await prisma.$transaction(async tx => {
      const created = await tx.storeCredit.create({ data: { tenantId: tenant, customerId, amountPyg, remainingPyg: amountPyg, note, createdById: session.user.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STORE_CREDIT_ISSUED', entity: 'StoreCredit', entityId: created.id, metadata: { customerId, amountPyg, origin: 'MANUAL', note } } })
      return created
    })
    return json(credit, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo emitir el saldo a favor.', 400)
  }
}
