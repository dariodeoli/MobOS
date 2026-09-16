import type { Prisma } from '@prisma/client'
import { logEmailOutcome, paymentDueReminderEmail, reservationDueEmail, warrantyStatusEmail } from './email'
import { enqueueEmail } from './email-outbox'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type NotificationClient = Pick<Prisma.TransactionClient, 'customer' | 'tenant' | 'emailOutbox'>

export function customerEmailValid(email: string | null | undefined): email is string {
  return typeof email === 'string' && emailPattern.test(email)
}

// Matchea una ficha de cliente del tenant por nombre (case-insensitive) y con
// correo cargado. Nombre ambiguo: se toma la ficha más antigua, de forma
// determinista; los avisos son tolerantes y nunca bloquean la operación.
export async function findCustomerForNotification(tx: NotificationClient, tenantId: string, customerName: string) {
  const name = customerName.trim()
  if (!name) return null
  return tx.customer.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' }, email: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true },
  })
}

async function storeName(tx: NotificationClient, tenantId: string) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  return tenant?.name?.trim() || 'MobOS'
}

// Aviso de cambio de estado de garantía. Dedupe por caso+estado vía aggregateId.
// Nunca lanza: el PATCH de garantías no puede romperse por un correo.
export async function notifyWarrantyStatusChanged(tx: NotificationClient, input: { tenantId: string; caseId: string; customerName: string; serial: string; statusLabel: string }) {
  try {
    const customer = await findCustomerForNotification(tx, input.tenantId, input.customerName)
    if (!customer || !customerEmailValid(customer.email)) return false
    const message = warrantyStatusEmail({ to: customer.email, customerName: customer.name, serial: input.serial, storeName: await storeName(tx, input.tenantId), statusLabel: input.statusLabel })
    if (!message) { logEmailOutcome('warranty-update', 'unconfigured'); return false }
    await enqueueEmail(tx, { tenantId: input.tenantId, kind: 'warranty-update', aggregateType: 'WarrantyCase', aggregateId: `${input.caseId}:${input.statusLabel}`, message })
    return true
  } catch (cause) {
    logEmailOutcome('warranty-update', 'unconfigured')
    console.info(JSON.stringify({ event: 'mobos.transactional_email', kind: 'warranty-update', error: cause instanceof Error ? cause.message : 'unknown' }))
    return false
  }
}

// Recordatorio de cuota por vencer. Nunca lanza; sin correo de cliente, se omite.
export async function notifyPaymentDue(tx: NotificationClient, input: { tenantId: string; paymentId: string; customerName: string; customerEmail: string | null; orderNumber: string; dueAt: Date; amountPyg: number }) {
  try {
    if (!customerEmailValid(input.customerEmail)) return false
    const message = paymentDueReminderEmail({ to: input.customerEmail, customerName: input.customerName, orderNumber: input.orderNumber, dueAt: input.dueAt, amountPyg: input.amountPyg, storeName: await storeName(tx, input.tenantId) })
    if (!message) { logEmailOutcome('payment-due', 'unconfigured'); return false }
    await enqueueEmail(tx, { tenantId: input.tenantId, kind: 'payment-due', aggregateType: 'Payment', aggregateId: input.paymentId, message })
    return true
  } catch (cause) {
    logEmailOutcome('payment-due', 'unconfigured')
    console.info(JSON.stringify({ event: 'mobos.transactional_email', kind: 'payment-due', error: cause instanceof Error ? cause.message : 'unknown' }))
    return false
  }
}

// Aviso de reserva por vencer. Nunca lanza; sin correo de cliente, se omite.
export async function notifyReservationDue(tx: NotificationClient, input: { tenantId: string; unitId: string; customerName: string; itemLabel: string; reservedUntil: Date }) {
  try {
    const customer = await findCustomerForNotification(tx, input.tenantId, input.customerName)
    if (!customer || !customerEmailValid(customer.email)) return false
    const message = reservationDueEmail({ to: customer.email, customerName: customer.name, itemLabel: input.itemLabel, reservedUntil: input.reservedUntil, storeName: await storeName(tx, input.tenantId) })
    if (!message) { logEmailOutcome('reservation-due', 'unconfigured'); return false }
    await enqueueEmail(tx, { tenantId: input.tenantId, kind: 'reservation-due', aggregateType: 'InventoryUnit', aggregateId: input.unitId, message })
    return true
  } catch (cause) {
    logEmailOutcome('reservation-due', 'unconfigured')
    console.info(JSON.stringify({ event: 'mobos.transactional_email', kind: 'reservation-due', error: cause instanceof Error ? cause.message : 'unknown' }))
    return false
  }
}
