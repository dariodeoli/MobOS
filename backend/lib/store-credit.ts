import type { Prisma } from '@prisma/client'
import { InputError } from './payment-input'

// Consumo del saldo a favor del cliente (nota de crédito interna). Vive en un
// módulo compartido porque el saldo se puede aplicar por dos caminos que deben
// descontar igual: el cobro suelto sobre un pedido y el alta de la venta con
// pagos incluidos (el POS manda la venta y sus pagos en un solo POST).
//
// Toma los créditos más antiguos primero (FIFO), registra cada uso contra el
// pedido y el cobro, y deja auditoría. Si no alcanza, la transacción entera
// revierte: el pago no se registra.
export async function consumeStoreCredit(tx: Prisma.TransactionClient, input: {
  tenantId: string; customerId: string | null; orderId: string; paymentId: string; userId: string; amountPyg: number; method: string
}) {
  if (input.method !== 'STORE_CREDIT') return
  if (!input.customerId) throw new InputError('El saldo a favor necesita un cliente identificado en la venta.', 409)
  const credits = await tx.$queryRaw<Array<{ id: string; remainingPyg: number }>>`
    SELECT "id", "remainingPyg" FROM "StoreCredit"
    WHERE "tenantId" = ${input.tenantId} AND "customerId" = ${input.customerId} AND "remainingPyg" > 0
    ORDER BY "createdAt" ASC FOR UPDATE`
  const available = credits.reduce((sum, credit) => sum + credit.remainingPyg, 0)
  if (available < input.amountPyg) throw new InputError('El cliente no tiene saldo a favor suficiente.', 409)
  let left = input.amountPyg
  for (const credit of credits) {
    if (left <= 0) break
    const take = Math.min(credit.remainingPyg, left)
    await tx.storeCredit.update({ where: { id: credit.id }, data: { remainingPyg: { decrement: take } } })
    await tx.storeCreditUse.create({ data: { tenantId: input.tenantId, creditId: credit.id, orderId: input.orderId, paymentId: input.paymentId, amountPyg: take, createdById: input.userId } })
    left -= take
  }
  await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.userId, action: 'STORE_CREDIT_USED', entity: 'Order', entityId: input.orderId, metadata: { paymentId: input.paymentId, amountPyg: input.amountPyg } } })
}
