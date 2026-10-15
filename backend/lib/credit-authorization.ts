import bcrypt from 'bcryptjs'
import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from './prisma'
import { InputError } from './payment-input'
import { AUTHORIZATION_RESOLVERS } from './authorizations'
import { numero } from './montos'
import { pinValido } from './pin'
import { enviarWebPush } from './web-push'
import { logError } from './log'
import { evaluateCreditSale, type CreditEvaluation } from './credit-rules'

// Autorización de crédito (issue «sin entrega automática»): una venta a crédito
// cuyo saldo sin cobrar supera el crédito disponible del cliente (límite menos
// deuda abierta, incluidos otros pedidos a crédito) NO puede entregarse hasta
// que un administrador o gerente la apruebe. La solicitud vive en la tabla de
// autorizaciones (kind ORDER_CREDIT_OVER, sujeto = el pedido) para que aparezca
// en la campana y en «Autorizaciones» sin una tabla nueva.

export const CREDIT_OVER_KIND = 'ORDER_CREDIT_OVER'
export const CREDIT_PIN_FAILED_ACTION = 'CREDIT_PIN_FAILED'
const CREDIT_PIN_MAX_FAILURES = 5
const CREDIT_PIN_WINDOW_MS = 15 * 60 * 1000

export { evaluateCreditSale, type CreditEvaluation }

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Bloquea la ficha del cliente (FOR UPDATE) y devuelve su límite y su deuda
 * abierta. Dos ventas a crédito simultáneas del mismo cliente se serializan
 * acá: la segunda espera a que la primera confirme y ya ve su pedido.
 * `excludeOrderId` deja afuera el pedido que se está evaluando.
 */
export async function lockCustomerCredit(tx: Prisma.TransactionClient, tenantId: string, customerId: string, excludeOrderId?: string): Promise<{ limitPyg: number; debtPyg: number; creditDays: number | null }> {
  const rows = await tx.$queryRaw<Array<{ creditLimitPyg: bigint | number | null; creditDays: number | null }>>`
    SELECT "creditLimitPyg", "creditDays" FROM "Customer" WHERE "id" = ${customerId} AND "tenantId" = ${tenantId} FOR UPDATE`
  if (!rows.length) throw new InputError('Cliente no encontrado.', 404)
  const debt = await tx.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(o."totalPyg" - COALESCE(p.confirmed, 0)), 0)::bigint AS total
    FROM "Order" o
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${tenantId} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
    WHERE o."tenantId" = ${tenantId} AND o."customerId" = ${customerId} AND o."status" = 'PENDING'
      AND (${excludeOrderId ?? null}::text IS NULL OR o."id" <> ${excludeOrderId ?? null})`
  const debtPyg = numero(debt[0]?.total)
  if (!Number.isSafeInteger(debtPyg)) throw new InputError('No se pudo calcular la deuda del cliente.', 409)
  return { limitPyg: numero(rows[0].creditLimitPyg), debtPyg: Math.max(0, debtPyg), creditDays: rows[0].creditDays }
}

export type CreditApprover = { id: string; name: string; role: string }

export const isCreditResolverRole = (role: string) => (AUTHORIZATION_RESOLVERS as readonly string[]).includes(role)

/**
 * Identifica a quien aprueba por su PIN de operador (único por empresa). Solo
 * valen administradores y gerentes activos. Los intentos fallidos se cuentan
 * por solicitante en la auditoría (5 en 15 minutos → 429) para que el
 * mostrador no sirva para adivinar PINs, sin bloquear la cuenta del dueño.
 * Se llama FUERA de la transacción: bcrypt es lento.
 */
export async function verifyApproverPin(input: { tenantId: string; requesterId: string; pin: unknown }): Promise<CreditApprover> {
  const desde = new Date(Date.now() - CREDIT_PIN_WINDOW_MS)
  const fallos = await prisma.auditLog.count({ where: { tenantId: input.tenantId, userId: input.requesterId, action: CREDIT_PIN_FAILED_ACTION, createdAt: { gte: desde } } })
  if (fallos >= CREDIT_PIN_MAX_FAILURES) throw new InputError('Demasiados PIN incorrectos. Esperá 15 minutos o pedí que gerencia apruebe desde su sesión.', 429)
  const pin = typeof input.pin === 'string' ? input.pin.trim() : ''
  const registrarFallo = async (motivo: string) => {
    await prisma.auditLog.create({ data: { tenantId: input.tenantId, userId: input.requesterId, action: CREDIT_PIN_FAILED_ACTION, entity: 'Tenant', entityId: input.tenantId, metadata: { motivo } } })
  }
  if (!pinValido(pin)) {
    await registrarFallo('formato')
    throw new InputError('PIN de gerente o administrador incorrecto.', 403)
  }
  const now = new Date()
  const candidatos = await prisma.user.findMany({
    where: { tenantId: input.tenantId, status: 'ACTIVE', role: { in: [...AUTHORIZATION_RESOLVERS] as UserRole[] }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    select: { id: true, name: true, role: true, pinHash: true },
  })
  const coinciden: CreditApprover[] = []
  for (const candidato of candidatos) {
    if (await bcrypt.compare(pin, candidato.pinHash)) coinciden.push({ id: candidato.id, name: candidato.name, role: candidato.role })
  }
  if (coinciden.length === 0) {
    await registrarFallo('pin')
    throw new InputError('PIN de gerente o administrador incorrecto.', 403)
  }
  // Como en el acceso: un PIN repetido entre dos aprobadores es ambiguo y se rechaza.
  if (coinciden.length > 1) throw new InputError('Ese PIN lo comparten varios aprobadores. Pedí a administración que asigne PINs distintos.', 409)
  return coinciden[0]
}

export type CreditAuthorizationSummary = {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  overPyg: number
  limitPyg: number
  debtPyg: number
  unpaidPyg: number
  availablePyg: number
  requestedAt: string
  requestedByName: string | null
  resolvedAt: string | null
  resolvedByName: string | null
  resolvedNote: string | null
}

type AuthorizationRow = {
  id: string
  entityId: string | null
  status: string
  requestedValue: unknown
  createdAt: Date
  resolvedAt: Date | null
  resolvedNote: string | null
  requestedBy?: { name: string } | null
  resolvedBy?: { name: string } | null
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const asNumber = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }

export function summarizeCreditAuthorization(row: AuthorizationRow): CreditAuthorizationSummary {
  const value = asRecord(row.requestedValue)
  return {
    id: row.id,
    status: row.status as CreditAuthorizationSummary['status'],
    overPyg: asNumber(value.overPyg),
    limitPyg: asNumber(value.limitPyg),
    debtPyg: asNumber(value.debtPyg),
    unpaidPyg: asNumber(value.unpaidPyg),
    availablePyg: asNumber(value.availablePyg),
    requestedAt: row.createdAt.toISOString(),
    requestedByName: row.requestedBy?.name ?? null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByName: row.resolvedBy?.name ?? null,
    resolvedNote: row.resolvedNote,
  }
}

/** Última autorización de crédito de cada pedido (la que manda sobre la entrega). */
export async function creditAuthorizationsFor(db: Db, tenantId: string, orderIds: string[]): Promise<Map<string, CreditAuthorizationSummary>> {
  const resultado = new Map<string, CreditAuthorizationSummary>()
  if (!orderIds.length) return resultado
  const filas = await db.customerAuthorization.findMany({
    where: { tenantId, kind: CREDIT_OVER_KIND, entity: 'ORDER', entityId: { in: orderIds } },
    orderBy: { createdAt: 'desc' },
    include: { requestedBy: { select: { name: true } }, resolvedBy: { select: { name: true } } },
  })
  for (const fila of filas) {
    if (fila.entityId && !resultado.has(fila.entityId)) resultado.set(fila.entityId, summarizeCreditAuthorization(fila))
  }
  return resultado
}

/** Agrega `creditAuthorization` al pedido (null si nunca pidió autorización). */
export async function withCreditAuthorization<T extends { id: string }>(db: Db, tenantId: string, order: T): Promise<T & { creditAuthorization: CreditAuthorizationSummary | null }> {
  const mapa = await creditAuthorizationsFor(db, tenantId, [order.id])
  return { ...order, creditAuthorization: mapa.get(order.id) ?? null }
}

/** Lista de pedidos con su estado de crédito en una sola consulta. */
export async function withCreditAuthorizations<T extends { id: string }>(db: Db, tenantId: string, orders: T[]): Promise<Array<T & { creditAuthorization: CreditAuthorizationSummary | null }>> {
  const mapa = await creditAuthorizationsFor(db, tenantId, orders.map(order => order.id))
  return orders.map(order => ({ ...order, creditAuthorization: mapa.get(order.id) ?? null }))
}

/**
 * Un pedido con autorización de crédito pendiente o rechazada no se entrega,
 * ni siquiera por un administrador: primero se resuelve la autorización.
 */
export async function assertCreditCleared(db: Db, tenantId: string, orderId: string) {
  const ultima = (await creditAuthorizationsFor(db, tenantId, [orderId])).get(orderId)
  if (!ultima || ultima.status === 'APPROVED') return
  // Si el pedido ya se cobró entero no hay crédito en juego: nada que autorizar.
  const pedido = await db.order.findFirst({ where: { id: orderId, tenantId }, select: { totalPyg: true } })
  const cobrado = await db.payment.aggregate({ where: { tenantId, orderId, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
  if (pedido && numero(pedido.totalPyg) - numero(cobrado._sum.amountPyg) <= 0) return
  if (ultima.status === 'PENDING') {
    throw new InputError(`Pendiente de autorización de crédito: el cliente superaría su crédito en Gs ${ultima.overPyg.toLocaleString('es-PY')}. Un administrador o gerente debe autorizar la entrega.`, 409)
  }
  throw new InputError(`La autorización de crédito fue rechazada${ultima.resolvedNote ? `: ${ultima.resolvedNote}` : ''}. El pedido no se puede entregar.`, 409)
}

export function creditRequestValue(orderId: string, evaluation: CreditEvaluation, extra: Record<string, unknown> = {}): Prisma.InputJsonValue {
  return { orderId, overPyg: evaluation.overPyg, limitPyg: evaluation.limitPyg, debtPyg: evaluation.debtPyg, unpaidPyg: evaluation.unpaidPyg, availablePyg: evaluation.availablePyg, noLimit: evaluation.noLimit, ...extra } as Prisma.InputJsonValue
}

/** Crea la solicitud pendiente del pedido y deja el rastro en la auditoría. */
export async function createCreditHold(tx: Prisma.TransactionClient, input: { tenantId: string; orderId: string; orderNumber: string | null; customerId: string; requestedById: string; evaluation: CreditEvaluation; note?: string | null }) {
  const created = await tx.customerAuthorization.create({
    data: { tenantId: input.tenantId, customerId: input.customerId, kind: CREDIT_OVER_KIND, status: 'PENDING', entity: 'ORDER', entityId: input.orderId, requestedById: input.requestedById, requestedValue: creditRequestValue(input.orderId, input.evaluation, { orderNumber: input.orderNumber }), note: input.note ?? null },
    select: { id: true },
  })
  await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.requestedById, action: 'ORDER_CREDIT_HELD', entity: 'Order', entityId: input.orderId, metadata: { authorizationId: created.id, orderNumber: input.orderNumber, customerId: input.customerId, overPyg: input.evaluation.overPyg, limitPyg: input.evaluation.limitPyg, debtPyg: input.evaluation.debtPyg, unpaidPyg: input.evaluation.unpaidPyg, noLimit: input.evaluation.noLimit } } })
  return created.id
}

/**
 * Resuelve (aprueba o rechaza) la autorización de crédito de un pedido. Un solo
 * ganador por solicitud: `updateMany` condicionado a PENDING. Deja auditoría con
 * quién aprobó, el monto sobre el límite y si fue por sesión o por PIN.
 */
export async function resolveCreditAuthorization(tx: Prisma.TransactionClient, input: { tenantId: string; orderId: string; orderNumber: string | null; authorizationId: string; action: 'approve' | 'reject'; approver: CreditApprover; performedById: string; via: 'SESSION' | 'PIN' | 'POS'; note?: string | null }) {
  const current = await tx.customerAuthorization.findFirst({ where: { id: input.authorizationId, tenantId: input.tenantId, kind: CREDIT_OVER_KIND, entity: 'ORDER', entityId: input.orderId }, select: { id: true, status: true, requestedValue: true, customerId: true } })
  if (!current) throw new InputError('Autorización de crédito no encontrada.', 404)
  const now = new Date()
  const claimed = await tx.customerAuthorization.updateMany({
    where: { id: current.id, tenantId: input.tenantId, status: 'PENDING' },
    data: { status: input.action === 'approve' ? 'APPROVED' : 'REJECTED', resolvedById: input.approver.id, resolvedAt: now, resolvedNote: input.note ?? null, resolvedValue: input.action === 'approve' ? { approved: true } : { approved: false }, ...(input.action === 'approve' ? { usedAt: now, usedByOrderId: input.orderId } : {}) },
  })
  if (claimed.count !== 1) throw new InputError('La autorización de crédito ya fue resuelta.', 409)
  const value = asRecord(current.requestedValue)
  await tx.auditLog.create({ data: {
    tenantId: input.tenantId, userId: input.approver.id,
    action: input.action === 'approve' ? 'ORDER_CREDIT_AUTHORIZED' : 'ORDER_CREDIT_REJECTED',
    entity: 'Order', entityId: input.orderId,
    metadata: { authorizationId: current.id, orderNumber: input.orderNumber, customerId: current.customerId, overPyg: asNumber(value.overPyg), limitPyg: asNumber(value.limitPyg), debtPyg: asNumber(value.debtPyg), unpaidPyg: asNumber(value.unpaidPyg), approverId: input.approver.id, approverName: input.approver.name, approverRole: input.approver.role, performedById: input.performedById, via: input.via, ...(input.note ? { note: input.note } : {}) },
  } })
}

/** Aprobación directa en el mostrador (PIN o dueño en el POS): nace aprobada. */
export async function recordCreditApproval(tx: Prisma.TransactionClient, input: { tenantId: string; orderId: string; orderNumber: string | null; customerId: string; requestedById: string; evaluation: CreditEvaluation; approver: CreditApprover; via: 'SESSION' | 'PIN' | 'POS' }) {
  const now = new Date()
  const created = await tx.customerAuthorization.create({
    data: { tenantId: input.tenantId, customerId: input.customerId, kind: CREDIT_OVER_KIND, status: 'APPROVED', entity: 'ORDER', entityId: input.orderId, requestedById: input.requestedById, resolvedById: input.approver.id, resolvedAt: now, usedAt: now, usedByOrderId: input.orderId, requestedValue: creditRequestValue(input.orderId, input.evaluation, { orderNumber: input.orderNumber }), resolvedValue: { approved: true } },
    select: { id: true },
  })
  await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.approver.id, action: 'ORDER_CREDIT_AUTHORIZED', entity: 'Order', entityId: input.orderId, metadata: { authorizationId: created.id, orderNumber: input.orderNumber, customerId: input.customerId, overPyg: input.evaluation.overPyg, limitPyg: input.evaluation.limitPyg, debtPyg: input.evaluation.debtPyg, unpaidPyg: input.evaluation.unpaidPyg, approverId: input.approver.id, approverName: input.approver.name, approverRole: input.approver.role, performedById: input.requestedById, via: input.via } } })
  return created.id
}

/**
 * Aviso a quien resuelve (campana + Web Push). El detalle con nombre y monto
 * vive en la campana; el push es genérico, como el resto de los avisos.
 * Nunca lanza: si el push falla, la campana sigue siendo la fuente oficial.
 */
export async function notifyCreditHold(input: { tenantId: string; orderId: string; authorizationId: string; branchId: string | null }) {
  try {
    const destinatarios = await prisma.user.findMany({
      where: { tenantId: input.tenantId, status: 'ACTIVE', role: { in: [...AUTHORIZATION_RESOLVERS] as UserRole[] }, OR: [{ role: 'ADMIN' }, { branchId: null }, ...(input.branchId ? [{ branchId: input.branchId }] : [])] },
      select: { id: true },
    })
    for (const destinatario of destinatarios) {
      await enviarWebPush({ tenantId: input.tenantId, userId: destinatario.id, titulo: 'Autorizar entrega a crédito', cuerpo: 'Un cliente superaría su crédito. Abrí MobOS para autorizar o rechazar.', url: `/pedidos/${input.orderId}`, tag: `credito-${input.authorizationId}`, urgente: true })
    }
  } catch (cause) {
    logError('credito: no se pudo avisar por push', { orderId: input.orderId, error: cause instanceof Error ? cause.message : String(cause) })
  }
}

/**
 * Entregar con saldo a un cliente con crédito convierte el pedido en venta a
 * crédito: se vuelve a controlar el crédito disponible (deuda sin este pedido +
 * su saldo vs. el límite). Si lo supera, hace falta la autorización aprobada.
 */
export async function assertCreditAvailableForDelivery(input: { tenantId: string; orderId: string; customerId: string; pendingPyg: number }) {
  const posicion = await prisma.$transaction(tx => lockCustomerCredit(tx, input.tenantId, input.customerId, input.orderId))
  const evaluacion = evaluateCreditSale({ limitPyg: posicion.limitPyg, debtPyg: posicion.debtPyg, unpaidPyg: input.pendingPyg })
  if (!evaluacion.requiresAuthorization) return
  const autorizacion = (await creditAuthorizationsFor(prisma, input.tenantId, [input.orderId])).get(input.orderId)
  if (autorizacion?.status !== 'APPROVED') {
    throw new InputError(`Entregar con saldo superaría el crédito del cliente en Gs ${evaluacion.overPyg.toLocaleString('es-PY')}. Solicitá la autorización de crédito desde el pedido.`, 409)
  }
}
