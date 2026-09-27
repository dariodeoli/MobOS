// Gift cards reales (#280): canje atómico contra el saldo, snapshot de la
// cuenta que cobró la emisión y los movimientos que explican cada operación.
import type { Prisma, PaymentAccount } from '@prisma/client'
import { InputError } from './payment-input'
import { LIMITE_MONTO_VENTAS, numero } from './montos'
import { codigoGiftCardValido, hashCodigoGiftCard } from './gift-card-code'

export function esMontoGiftCard(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= LIMITE_MONTO_VENTAS
}

export function snapshotCuentaGiftCard(account: PaymentAccount): Prisma.InputJsonObject {
  return {
    id: account.id,
    name: account.name,
    bank: account.bank,
    currency: account.currency,
    kind: account.kind,
    isActive: account.isActive,
  }
}

// Canje dentro de la transacción del cobro: bloquea la tarjeta por código,
// valida estado/vencimiento/saldo con el reloj de Postgres y descuenta el saldo
// dejando el movimiento y la auditoría. Si dos cobros llegan juntos, el FOR
// UPDATE serializa y el que no alcanza revierte la transacción entera.
export async function consumirGiftCard(tx: Prisma.TransactionClient, input: {
  tenantId: string
  userId: string
  orderId: string
  paymentId: string
  code: string
  amountPyg: bigint | number
}) {
  const codigo = codigoGiftCardValido(input.code)
  if (!codigo) throw new InputError('El código de gift card no es válido.')
  const amountPyg = numero(input.amountPyg)
  if (!esMontoGiftCard(amountPyg)) throw new InputError('El monto del canje debe ser un entero positivo.')
  const rows = await tx.$queryRaw<Array<{ id: string; balancePyg: bigint; status: string; expirada: boolean }>>`
    SELECT "id", "balancePyg", "status"::text AS "status",
           ("expiresAt" IS NOT NULL AND "expiresAt" <= now()) AS "expirada"
    FROM "GiftCard"
    WHERE "tenantId" = ${input.tenantId} AND "codeHash" = ${hashCodigoGiftCard(codigo)}
    FOR UPDATE`
  const tarjeta = rows[0]
  if (!tarjeta) throw new InputError('No encontramos una gift card con ese código.', 404)
  if (tarjeta.status !== 'ACTIVE') throw new InputError('La gift card está anulada.', 409)
  if (tarjeta.expirada) throw new InputError('La gift card venció.', 409)
  const saldo = numero(tarjeta.balancePyg)
  if (saldo < amountPyg) throw new InputError(`La gift card no tiene saldo suficiente (disponible ${saldo.toLocaleString('es-PY')} Gs).`, 409)
  const saldoDespues = saldo - amountPyg
  await tx.giftCard.update({ where: { id: tarjeta.id }, data: { balancePyg: saldoDespues } })
  await tx.giftCardMovement.create({
    data: {
      tenantId: input.tenantId,
      giftCardId: tarjeta.id,
      kind: 'REDEEM',
      amountPyg,
      balanceAfterPyg: saldoDespues,
      orderId: input.orderId,
      paymentId: input.paymentId,
      userId: input.userId,
    },
  })
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'GIFT_CARD_REDEEMED',
      entity: 'GiftCard',
      entityId: tarjeta.id,
      metadata: { orderId: input.orderId, paymentId: input.paymentId, amountPyg, balanceAfterPyg: saldoDespues },
    },
  })
  return { id: tarjeta.id, balanceAfterPyg: saldoDespues }
}
