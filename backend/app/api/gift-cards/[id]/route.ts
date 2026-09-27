import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'
import { InputError, objectInput } from '../../../../lib/payment-input'
import { numero } from '../../../../lib/montos'

const PERMISOS = ['pos:use', 'payments:manage', 'orders:manage', 'orders:own', 'orders:branch']

// Ficha de una gift card con su historial (emisión, canjes y anulación).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISOS)) return error('No autorizado.', 403)
  const { id } = await context.params
  const tarjeta = await prisma.giftCard.findFirst({
    where: { id, tenantId: tenant },
    select: {
      id: true, codeLast4: true, amountPyg: true, balancePyg: true, status: true,
      expiresAt: true, note: true, createdAt: true,
      customer: { select: { id: true, name: true } },
      movements: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, kind: true, amountPyg: true, balanceAfterPyg: true, note: true, createdAt: true,
          accountId: true, accountSnapshot: true,
          order: { select: { id: true, orderNumber: true } },
          payment: { select: { id: true, method: true } },
        },
      },
    },
  })
  if (!tarjeta) return error('Gift card no encontrada.', 404)
  return json(tarjeta)
}

// Anulación de gerencia: el saldo que quedaba no se puede canjear y el
// movimiento deja el rastro para auditoría.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['orders:manage'])) return error('Solo administración o gerencia anulan gift cards.', 403)
  const { id } = await context.params
  try {
    const body = objectInput(await request.json())
    if (body.action !== 'cancel') throw new InputError('Acción de gift card inválida.')
    const tarjeta = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; balancePyg: bigint; status: string }>>`
        SELECT "id", "balancePyg", "status"::text AS "status" FROM "GiftCard"
        WHERE "id" = ${id} AND "tenantId" = ${tenant} FOR UPDATE`
      const actual = rows[0]
      if (!actual) throw new InputError('Gift card no encontrada.', 404)
      if (actual.status !== 'ACTIVE') throw new InputError('La gift card ya está anulada.', 409)
      const saldo = numero(actual.balancePyg)
      await tx.giftCard.update({ where: { id: actual.id }, data: { status: 'CANCELLED', balancePyg: 0 } })
      await tx.giftCardMovement.create({
        data: { tenantId: tenant, giftCardId: actual.id, kind: 'CANCEL', amountPyg: saldo, balanceAfterPyg: 0, userId: session.user.id },
      })
      await tx.auditLog.create({
        data: { tenantId: tenant, userId: session.user.id, action: 'GIFT_CARD_CANCELLED', entity: 'GiftCard', entityId: actual.id, metadata: { forfeitedPyg: saldo } },
      })
      return { id: actual.id, status: 'CANCELLED', balancePyg: 0 }
    })
    return json(tarjeta)
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo anular la gift card.', 400)
  }
}
