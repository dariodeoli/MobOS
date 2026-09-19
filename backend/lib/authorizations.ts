import type { Prisma } from '@prisma/client'
import { InputError } from './payment-input'

// Motor genérico de autorizaciones comerciales: una solicitud pendiente por
// vendedor + tipo + sujeto, resuelta por gerencia y consumida una sola vez.
// Las condiciones del cliente (mayorista, crédito, plazo, descuento) y las
// operaciones sensibles del día a día (ajuste de stock, anulación de pedido,
// venta bajo lista) comparten estas reglas de vigencia y consumo.

export const AUTHORIZATION_KINDS = [
  'WHOLESALE',
  'CREDIT',
  'CREDIT_DAYS',
  'DISCOUNT',
  'BELOW_LIST_PRICE',
  'STOCK_ADJUST',
  'ORDER_VOID',
  'EXPENSE_OVER_LIMIT',
  'TRANSFER',
  'PURCHASE_CREDIT',
] as const
export type AuthorizationKind = typeof AUTHORIZATION_KINDS[number]

export const AUTHORIZATION_RESOLVERS = ['ADMIN', 'GERENTE'] as const
export const DISCOUNT_MAX_PYG = 100000000
export const AUTHORIZATION_MAX_AGE_MS = 24 * 60 * 60 * 1000
// Límites por defecto cuando la empresa no configuró los suyos.
export const DEFAULT_EXPENSE_LIMIT_PYG = 1000000
export const DEFAULT_PURCHASE_CREDIT_LIMIT_PYG = 5000000

const INT_MAX = 2147483647

export type AuthorizationValue = {
  creditLimitPyg?: number
  creditDays?: number
  discountPyg?: number
  maxDiscountPyg?: number
  discountPct?: number
  productId?: string
  description?: string
  unitId?: string
  action?: string
  reason?: string
  orderId?: string
  approved?: boolean
  adjustedStock?: number
  amountPyg?: number
  maxAmountPyg?: number
  sourceBranchId?: string
  destinationBranchId?: string
  quantity?: number
  serials?: string[]
  supplierId?: string
  supplierName?: string
  totalPyg?: number
  maxTotalPyg?: number
}

export function safeIntValue(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

export function authorizationValueOf(value: unknown): AuthorizationValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AuthorizationValue : {}
}

// El máximo autorizado de un descuento o de una venta bajo lista.
export function maxDiscountPygOf(resolvedValue: unknown): number {
  const value = authorizationValueOf(resolvedValue)
  const amount = Number(value.maxDiscountPyg)
  return safeIntValue(amount, 0, DISCOUNT_MAX_PYG) ? amount : 0
}

// El máximo autorizado de un gasto (maxAmountPyg) o de una compra a crédito
// (maxTotalPyg). Devuelve -1 cuando la resolución no trae un monto válido.
export function authorizedAmountOf(resolvedValue: unknown, key: 'maxAmountPyg' | 'maxTotalPyg'): number {
  const value = authorizationValueOf(resolvedValue)
  const amount = Number(value[key])
  return safeIntValue(amount, 0, INT_MAX) ? amount : -1
}

type UsableAuthorization = {
  id: string
  kind: string
  status: string
  requestedById: string
  usedAt: Date | null
  resolvedAt: Date | null
  resolvedValue: unknown
}

// Valida que una autorización resuelta sirva para esta operación y devuelve el
// máximo autorizado. El vendedor solo puede consumir lo que él mismo pidió.
export function usableAuthorization(
  authorization: UsableAuthorization | null,
  options: { userId: string; kinds: readonly string[]; label: string },
): { id: string; maxDiscountPyg: number } {
  const { label } = options
  if (!authorization || !options.kinds.includes(authorization.kind)) {
    throw new InputError(`La autorización de ${label} no es válida para esta operación. Solicitá autorización a gerencia.`, 403)
  }
  if (authorization.status !== 'APPROVED' || authorization.requestedById !== options.userId) {
    throw new InputError(`La autorización de ${label} no es válida para esta operación. Solicitá autorización a gerencia.`, 403)
  }
  if (authorization.usedAt) throw new InputError(`La autorización de ${label} ya se usó. Solicitá una nueva.`, 403)
  if (!authorization.resolvedAt || authorization.resolvedAt.getTime() < Date.now() - AUTHORIZATION_MAX_AGE_MS) {
    throw new InputError(`La autorización de ${label} venció (más de 24 h). Solicitá una nueva.`, 403)
  }
  const maxDiscountPyg = maxDiscountPygOf(authorization.resolvedValue)
  if (maxDiscountPyg <= 0 && (options.kinds.includes('DISCOUNT') || options.kinds.includes('BELOW_LIST_PRICE'))) {
    throw new InputError(`La autorización de ${label} no tiene un máximo válido. Solicitá una nueva.`, 403)
  }
  return { id: authorization.id, maxDiscountPyg }
}

// Consumo atómico: dos operaciones concurrentes con la misma autorización no
// pueden usarla dos veces; la que pierde revierte su transacción entera.
export async function consumeAuthorization(
  tx: Prisma.TransactionClient,
  input: { id: string; tenantId: string; kinds: readonly string[]; userId: string; label: string; usedByOrderId?: string },
) {
  const claimed = await tx.customerAuthorization.updateMany({
    where: {
      id: input.id,
      tenantId: input.tenantId,
      kind: { in: [...input.kinds] },
      status: 'APPROVED',
      requestedById: input.userId,
      usedAt: null,
    },
    data: { usedAt: new Date(), ...(input.usedByOrderId === undefined ? {} : { usedByOrderId: input.usedByOrderId }) },
  })
  if (claimed.count !== 1) throw new InputError(`La autorización de ${input.label} ya se usó. Solicitá una nueva.`, 403)
}
