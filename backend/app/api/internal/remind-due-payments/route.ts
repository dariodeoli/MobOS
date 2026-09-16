import { timingSafeEqual } from 'node:crypto'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { customerEmailValid, notifyPaymentDue, notifyReservationDue } from '../../../../lib/email-notifications'

function authorized(request: Request) {
  const expected = process.env.MOBOS_MAINTENANCE_TOKEN
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!expected || !actual) return false
  const left = Buffer.from(expected); const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

const DAY_MS = 86400000

// Called by the platform scheduler across every isolated tenant:
// 1. recuerda cuotas a crédito que vencen en los próximos 3 días (una vez por
//    cuota, vía Payment.remindedAt);
// 2. avisa de reservas que vencen en las próximas 24 horas (una vez por
//    reserva, vía AuditLog RESERVATION_DUE_REMINDED).
export async function POST(request: Request) {
  if (!process.env.MOBOS_MAINTENANCE_TOKEN) return error('El mantenimiento programado todavía no está configurado.', 503)
  if (!authorized(request)) return error('No autorizado.', 401)
  const now = new Date()
  const dueSoon = new Date(now.getTime() + 3 * DAY_MS)
  const reservationsDueSoon = new Date(now.getTime() + DAY_MS)

  const payments = await prisma.payment.findMany({
    where: { status: 'PENDING', method: 'CREDIT', remindedAt: null, dueAt: { gt: now, lte: dueSoon } },
    select: { id: true, tenantId: true, amountPyg: true, dueAt: true, order: { select: { orderNumber: true, customer: { select: { name: true, email: true } } } } },
    orderBy: { dueAt: 'asc' },
  })
  let reminded = 0
  for (const payment of payments) {
    const email = payment.order?.customer?.email ?? null
    const enqueued = await notifyPaymentDue(prisma, {
      tenantId: payment.tenantId,
      paymentId: payment.id,
      customerName: payment.order?.customer?.name ?? '',
      customerEmail: email,
      orderNumber: payment.order.orderNumber,
      dueAt: payment.dueAt as Date,
      amountPyg: payment.amountPyg,
    })
    if (!customerEmailValid(email) && !enqueued) continue
    const marked = await prisma.payment.updateMany({ where: { id: payment.id, remindedAt: null }, data: { remindedAt: new Date() } })
    if (marked.count) reminded += 1
  }

  const reservationUnits = await prisma.inventoryUnit.findMany({
    where: { status: 'RESERVED', reservedUntil: { gt: now, lte: reservationsDueSoon } },
    select: { id: true, tenantId: true, serial: true, reservationCustomer: true, reservedUntil: true, product: { select: { name: true } } },
    orderBy: { reservedUntil: 'asc' },
  })
  let reservationReminded = 0
  for (const unit of reservationUnits) {
    const already = await prisma.auditLog.findFirst({ where: { tenantId: unit.tenantId, action: 'RESERVATION_DUE_REMINDED', entity: 'InventoryUnit', entityId: unit.id }, select: { id: true } })
    if (already) continue
    const enqueued = await prisma.$transaction(async tx => {
      const sent = await notifyReservationDue(tx, {
        tenantId: unit.tenantId,
        unitId: unit.id,
        customerName: unit.reservationCustomer ?? '',
        itemLabel: unit.product ? `${unit.product.name} (${unit.serial})` : unit.serial,
        reservedUntil: unit.reservedUntil as Date,
      })
      if (sent) await tx.auditLog.create({ data: { tenantId: unit.tenantId, action: 'RESERVATION_DUE_REMINDED', entity: 'InventoryUnit', entityId: unit.id, metadata: { reservedUntil: unit.reservedUntil?.toISOString() ?? null } } })
      return sent
    })
    if (enqueued) reservationReminded += 1
  }

  return json({ reminded, reservationReminded, checkedAt: now.toISOString() })
}
