import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { LIMITE_MONTO_VENTAS } from '../../../lib/montos'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { crearCodigoGiftCard } from '../../../lib/gift-card-code'
import { esMontoGiftCard, snapshotCuentaGiftCard } from '../../../lib/gift-cards'

const PERMISOS = ['pos:use', 'payments:manage', 'orders:manage', 'orders:own', 'orders:branch']

const TARJETA = {
  id: true, codeLast4: true, amountPyg: true, balancePyg: true, status: true,
  expiresAt: true, note: true, createdAt: true,
  customer: { select: { id: true, name: true } },
} as const

// Gift cards reales (#280): listado para el POS (nunca expone el código; solo
// los últimos 4) y emisión con código que se muestra una única vez.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISOS)) return error('No autorizado.', 403)
  const rows = await prisma.giftCard.findMany({
    where: { tenantId: tenant },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: TARJETA,
  })
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISOS)) return error('No autorizado.', 403)
  const limited = enforceRateLimit(request, 'gift-cards', 30, 60_000)
  if (limited) return limited
  try {
    const body = objectInput(await request.json())
    const amountPyg = Number(body.amountPyg)
    if (!esMontoGiftCard(amountPyg)) throw new InputError(`El monto de la gift card debe ser un entero positivo hasta ${LIMITE_MONTO_VENTAS.toLocaleString('es-PY')}.`)
    let customerId: string | null = null
    if (body.customerId !== undefined && body.customerId !== null && body.customerId !== '') {
      customerId = textInput(body.customerId, 'customerId', 200)
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
      if (!customer) throw new InputError('Cliente no encontrado.', 404)
    }
    let expiresAt: Date | null = null
    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
      const fecha = new Date(String(body.expiresAt))
      if (!Number.isFinite(fecha.getTime())) throw new InputError('El vencimiento de la gift card no es válido.')
      if (fecha.getTime() <= Date.now()) throw new InputError('El vencimiento de la gift card tiene que ser futuro.')
      expiresAt = fecha
    }
    let accountId: string | null = null
    let accountSnapshot: ReturnType<typeof snapshotCuentaGiftCard> | null = null
    if (body.accountId !== undefined && body.accountId !== null && body.accountId !== '') {
      accountId = textInput(body.accountId, 'accountId', 200)
      const account = await prisma.paymentAccount.findFirst({ where: { id: accountId, tenantId: tenant, isActive: true } })
      if (!account) throw new InputError('Cuenta de cobro no encontrada o inactiva.', 409)
      accountSnapshot = snapshotCuentaGiftCard(account)
    }
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Nota', 300)
    const { code, codeHash, last4 } = crearCodigoGiftCard()
    const tarjeta = await prisma.$transaction(async tx => {
      const created = await tx.giftCard.create({
        data: { tenantId: tenant, codeHash, codeLast4: last4, customerId, amountPyg, balancePyg: amountPyg, expiresAt, note, createdById: session.user.id },
        select: TARJETA,
      })
      await tx.giftCardMovement.create({
        data: { tenantId: tenant, giftCardId: created.id, kind: 'ISSUE', amountPyg, balanceAfterPyg: amountPyg, accountId, accountSnapshot: accountSnapshot ?? undefined, userId: session.user.id, note },
      })
      await tx.auditLog.create({
        data: { tenantId: tenant, userId: session.user.id, action: 'GIFT_CARD_ISSUED', entity: 'GiftCard', entityId: created.id, metadata: { amountPyg, codeLast4: last4, ...(customerId ? { customerId } : {}), ...(accountId ? { accountId } : {}) } },
      })
      return created
    })
    // El código crudo viaja una sola vez: en la base queda solo su sha256.
    return json({ ...tarjeta, code }, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo emitir la gift card.', 400)
  }
}
