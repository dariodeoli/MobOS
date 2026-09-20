import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../lib/payment-input'

type RouteContext = { params: { id: string } }

const INT_MAX = 2147483647
// Nota única del canje: la comparten el movimiento y el saldo a favor para que
// el estado de cuenta del cliente sea reconstruible.
const NOTA_CANJE = 'Canje de puntos de fidelización'

const clienteId = (params: RouteContext['params']) => (params.id || '').trim().slice(0, 128)

// Saldo de puntos del cliente, su historial y el porcentaje vigente de la
// empresa. Siempre acotado al tenant de la sesión.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = clienteId(params)
  if (!id) return error('Cliente obligatorio.')
  const tenant = session.user.tenantId
  const [customer, empresa] = await Promise.all([
    prisma.customer.findFirst({ where: { id, tenantId: tenant }, select: { id: true, loyaltyPointsPyg: true } }),
    prisma.tenant.findUnique({ where: { id: tenant }, select: { loyaltyPct: true } }),
  ])
  if (!customer) return error('Cliente no encontrado.', 404)
  const movements = await prisma.loyaltyMovement.findMany({
    where: { tenantId: tenant, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, kind: true, pointsPyg: true, note: true, orderId: true, createdAt: true, order: { select: { orderNumber: true } } },
  })
  return json({ pointsPyg: customer.loyaltyPointsPyg, movements, loyaltyPct: empresa?.loyaltyPct ?? 0 })
}

// Canje de puntos como saldo a favor: descuenta la caché, deja el movimiento
// REDEMPTION y emite un StoreCredit con la misma nota. Atómico: el saldo se
// re-chequea con la fila del cliente bloqueada, así el doble clic no canjea
// dos veces.
export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['orders:manage', 'payments:manage'])) return error('Tu rol no puede canjear puntos.', 403)
  const id = clienteId(params)
  if (!id) return error('Cliente obligatorio.')
  const tenant = session.user.tenantId
  try {
    const body = objectInput(await request.json())
    const pointsPyg = Number(body.pointsPyg)
    if (!Number.isSafeInteger(pointsPyg) || pointsPyg <= 0 || pointsPyg > INT_MAX) throw new InputError('El canje debe ser un entero de puntos positivo.')
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; loyaltyPointsPyg: number }>>`
        SELECT "id", "loyaltyPointsPyg" FROM "Customer"
        WHERE "id" = ${id} AND "tenantId" = ${tenant} FOR UPDATE`
      const customer = rows[0]
      if (!customer) throw new InputError('Cliente no encontrado.', 404)
      if (pointsPyg > customer.loyaltyPointsPyg) throw new InputError(`El cliente solo tiene ${customer.loyaltyPointsPyg} puntos disponibles.`, 409)
      const updated = await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPointsPyg: { decrement: pointsPyg } }, select: { loyaltyPointsPyg: true } })
      const movement = await tx.loyaltyMovement.create({ data: { tenantId: tenant, customerId: customer.id, kind: 'REDEMPTION', pointsPyg: -pointsPyg, note: NOTA_CANJE, createdById: session.user.id } })
      const credit = await tx.storeCredit.create({ data: { tenantId: tenant, customerId: customer.id, amountPyg: pointsPyg, remainingPyg: pointsPyg, note: NOTA_CANJE, createdById: session.user.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'LOYALTY_REDEEMED', entity: 'Customer', entityId: customer.id, metadata: { pointsPyg, movementId: movement.id, storeCreditId: credit.id } } })
      return { pointsPyg: updated.loyaltyPointsPyg, storeCredit: { id: credit.id, amountPyg: credit.amountPyg, remainingPyg: credit.remainingPyg, note: credit.note, createdAt: credit.createdAt } }
    })
    return json(result, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudieron canjear los puntos.', 409)
  }
}
