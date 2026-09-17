import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Autorizaciones comerciales del cliente: cualquier vendedor pide cambios de
// condición (mayorista, crédito, días) o un descuento fuera de política y
// administración/gerencia resuelve.
// VENDEDOR ve solo sus pedidos; ADMIN/GERENTE ven todas las del tenant.
const KINDS = ['WHOLESALE', 'CREDIT', 'CREDIT_DAYS', 'DISCOUNT']
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED']
const RESOLVERS = ['ADMIN', 'GERENTE']
const INT_MAX = 2147483647
const DISCOUNT_MAX = 100000000
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safeInt = (value: unknown, minimum: number, maximum: number): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum

const authorizationDetail = Prisma.validator<Prisma.CustomerAuthorizationInclude>()({
  customer: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
})

type ValueShape = { creditLimitPyg?: number; creditDays?: number; discountPyg?: number; maxDiscountPyg?: number }

// Valida el pedido según el tipo y devuelve solo las claves con valor.
function normalizeValue(kind: string, raw: unknown, label: string): ValueShape | string {
  if (raw === undefined || raw === null) {
    if (kind === 'WHOLESALE') return {}
    if (kind === 'DISCOUNT') return `${label}: el monto del descuento es obligatorio.`
    return kind === 'CREDIT' ? `${label}: el límite de crédito es obligatorio.` : `${label}: los días de crédito son obligatorios.`
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return `${label}: valor inválido.`
  const input = raw as Record<string, unknown>
  const value: ValueShape = {}
  if (kind === 'CREDIT') {
    if (input.creditLimitPyg === undefined || input.creditLimitPyg === null || input.creditLimitPyg === '') return `${label}: el límite de crédito es obligatorio.`
    const limit = Number(input.creditLimitPyg)
    if (!safeInt(limit, 0, INT_MAX)) return `${label}: el límite de crédito debe ser un entero entre 0 y ${INT_MAX}.`
    value.creditLimitPyg = limit
  }
  if (kind === 'CREDIT' || kind === 'CREDIT_DAYS') {
    if (input.creditDays !== undefined && input.creditDays !== null && input.creditDays !== '') {
      const days = Number(input.creditDays)
      if (!safeInt(days, 0, 365)) return `${label}: los días de crédito deben estar entre 0 y 365.`
      value.creditDays = days
    } else if (kind === 'CREDIT_DAYS') {
      return `${label}: los días de crédito son obligatorios.`
    }
  }
  if (kind === 'DISCOUNT') {
    // El pedido pide cuánto descontar; la resolución autoriza un máximo (puede
    // ser 0 o menor a lo pedido, pero nunca un monto negativo).
    const rawAmount = input.maxDiscountPyg ?? input.discountPyg
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') return `${label}: el monto del descuento es obligatorio.`
    const amount = Number(rawAmount)
    if (!safeInt(amount, 0, DISCOUNT_MAX)) return `${label}: el descuento debe ser un entero entre 0 y ${DISCOUNT_MAX}.`
    if (input.maxDiscountPyg !== undefined) value.maxDiscountPyg = amount
    else {
      if (amount <= 0) return `${label}: el descuento debe ser mayor a 0.`
      value.discountPyg = amount
    }
  }
  return value
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const status = clean(params.get('status'), 20).toUpperCase()
  const kind = clean(params.get('kind'), 20).toUpperCase()
  const customerId = clean(params.get('customerId'), 128)
  const mine = params.get('mine') === '1'
  if (status && !STATUSES.includes(status)) return error('Estado de solicitud inválido.')
  if (kind && !KINDS.includes(kind)) return error('Tipo de autorización inválido.')
  const seeAll = RESOLVERS.includes(session.user.role)
  const rows = await prisma.customerAuthorization.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(customerId ? { customerId } : {}),
      ...(mine || !seeAll ? { requestedById: session.user.id } : {}),
    },
    include: authorizationDetail,
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  // Pendientes primero: son las que requieren decisión.
  const pending = rows.filter(row => row.status === 'PENDING')
  const rest = rows.filter(row => row.status !== 'PENDING')
  return json([...pending, ...rest])
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const customerId = clean(body?.customerId, 128)
    const kind = clean(body?.kind, 20).toUpperCase()
    const note = clean(body?.note, 500) || null
    if (!KINDS.includes(kind)) return error('Tipo de autorización inválido.')
    // El descuento puede no tener cliente (venta de consumidor final); el
    // resto de los tipos sí exige ficha para aplicar la condición.
    if (!customerId && kind !== 'DISCOUNT') return error('Cliente obligatorio.')
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: session.user.tenantId }, select: { id: true } })
      if (!customer) return error('Cliente no encontrado.', 404)
    }
    const normalized = normalizeValue(kind, body?.requestedValue, 'Solicitud')
    if (typeof normalized === 'string') return error(normalized)
    const requestedJson = kind === 'WHOLESALE' ? null : (normalized as Prisma.InputJsonValue)
    const requestedValue = requestedJson ?? Prisma.DbNull
    // Un descuento pendiente por vendedor: si ya hay uno esperando, pedir otro
    // solo duplica la decisión de gerencia.
    if (kind === 'DISCOUNT') {
      const pending = await prisma.customerAuthorization.findFirst({ where: { tenantId: session.user.tenantId, requestedById: session.user.id, kind, status: 'PENDING' }, select: { id: true } })
      if (pending) return error('Ya tenés una solicitud de descuento pendiente. Esperá a que gerencia la resuelva.', 409)
    } else {
      const pending = await prisma.customerAuthorization.findFirst({ where: { tenantId: session.user.tenantId, customerId, kind, status: 'PENDING' }, select: { id: true } })
      if (pending) return error('Ya hay una solicitud pendiente de este tipo para el cliente.', 409)
    }
    const created = await prisma.$transaction(async tx => {
      const authorization = await tx.customerAuthorization.create({
        data: { tenantId: session.user.tenantId, customerId: customerId || null, kind, requestedValue, requestedById: session.user.id, note },
        include: authorizationDetail,
      })
      await tx.auditLog.create({ data: {
        tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_AUTHORIZATION_REQUESTED',
        entity: customerId ? 'Customer' : 'Order', entityId: customerId || 'discount',
        metadata: { kind, ...(requestedJson ? { requestedValue: requestedJson } : {}), ...(note ? { note } : {}) },
      } })
      return authorization
    })
    return json(created, { status: 201 })
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya hay una solicitud pendiente de este tipo.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar la solicitud.')
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!RESOLVERS.includes(session.user.role)) return error('Solo gerencia o el dueño pueden resolver solicitudes.', 403)
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = clean(body?.id, 128)
    const action = clean(body?.action, 20).toLowerCase()
    const resolvedNote = clean(body?.resolvedNote, 500) || null
    if (!id) return error('Solicitud obligatoria.')
    if (action !== 'approve' && action !== 'reject') return error('Acción inválida.')
    const current = await prisma.customerAuthorization.findFirst({ where: { id, tenantId: session.user.tenantId } })
    if (!current) return error('Solicitud no encontrada.', 404)
    if (current.status !== 'PENDING') return error('La solicitud ya fue resuelta.', 409)
    if (current.requestedById === session.user.id) return error('No podés resolver tu propia solicitud.', 403)
    // Un descuento rechazado sin motivo deja al vendedor sin saber qué corregir.
    if (action === 'reject' && current.kind === 'DISCOUNT' && !resolvedNote) return error('Indicá el motivo del rechazo.')

    const requested = (current.requestedValue && typeof current.requestedValue === 'object' && !Array.isArray(current.requestedValue)
      ? current.requestedValue
      : {}) as ValueShape
    let applied: ValueShape = {}
    if (action === 'approve') {
      const normalized = normalizeValue(current.kind, body?.resolvedValue === undefined || body?.resolvedValue === null ? requested : body.resolvedValue, 'Autorización')
      if (typeof normalized === 'string') return error(normalized)
      applied = normalized
      if (current.kind === 'CREDIT_DAYS' && applied.creditDays === undefined) applied.creditDays = requested.creditDays
      if (current.kind === 'CREDIT') {
        if (applied.creditLimitPyg === undefined) applied.creditLimitPyg = requested.creditLimitPyg
        if (applied.creditDays === undefined && requested.creditDays !== undefined) applied.creditDays = requested.creditDays
      }
      // El máximo autorizado puede ser menor (o 0) al pedido; sin resolución
      // explícita se autoriza lo pedido.
      if (current.kind === 'DISCOUNT') applied = { maxDiscountPyg: applied.maxDiscountPyg ?? requested.discountPyg ?? 0 }
    }
    const resolvedJson = action === 'approve' && current.kind !== 'WHOLESALE' ? (applied as Prisma.InputJsonValue) : null

    const updated = await prisma.$transaction(async tx => {
<<<<<<< HEAD
      // DISCOUNT no toca la ficha del cliente (puede no tener cliente) y los
      // demás kinds solo aplican si la solicitud tiene cliente asociado.
=======
>>>>>>> 5ca43a9 (feat(descuentos): autorizacion de descuentos fuera de politica para vendedores)
      if (action === 'approve' && current.customerId) {
        if (current.kind === 'WHOLESALE') {
          await tx.customer.update({ where: { id: current.customerId }, data: { pricingTier: 'WHOLESALE' } })
        } else if (current.kind === 'CREDIT') {
          await tx.customer.update({ where: { id: current.customerId }, data: {
            ...(applied.creditLimitPyg === undefined ? {} : { creditLimitPyg: applied.creditLimitPyg }),
            ...(applied.creditDays === undefined ? {} : { creditDays: applied.creditDays }),
          } })
        } else if (current.kind === 'CREDIT_DAYS') {
          await tx.customer.update({ where: { id: current.customerId }, data: { ...(applied.creditDays === undefined ? {} : { creditDays: applied.creditDays }) } })
        }
      }
      const authorization = await tx.customerAuthorization.update({
        where: { id: current.id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          resolvedValue: resolvedJson ?? Prisma.DbNull,
          resolvedById: session.user.id,
          resolvedNote,
          resolvedAt: new Date(),
        },
        include: authorizationDetail,
      })
      await tx.auditLog.create({ data: {
        tenantId: session.user.tenantId, userId: session.user.id,
        action: action === 'approve' ? 'CUSTOMER_AUTHORIZATION_APPROVED' : 'CUSTOMER_AUTHORIZATION_REJECTED',
<<<<<<< HEAD
        entity: current.customerId ? 'Customer' : 'Order', entityId: current.customerId ?? 'discount',
=======
        entity: current.customerId ? 'Customer' : 'Order', entityId: current.customerId || 'discount',
>>>>>>> 5ca43a9 (feat(descuentos): autorizacion de descuentos fuera de politica para vendedores)
        metadata: {
          kind: current.kind,
          ...(current.requestedValue ? { requestedValue: current.requestedValue as Prisma.InputJsonValue } : {}),
          ...(resolvedJson ? { resolvedValue: resolvedJson } : {}),
          ...(resolvedNote ? { resolvedNote } : {}),
        },
      } })
      return authorization
    })
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la solicitud.')
  }
}
