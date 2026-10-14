import { numero } from './montos'

// Funciones puras de neteo de correcciones de pago (#393); sin Prisma para
// poder usarse desde lib/reporting.ts y sus pruebas aisladas. Ver payment-net.ts.

export type Rowish = { id?: string | null; reversalOfId?: string | null; status?: string | null; amountPyg: bigint | number | null | undefined }

/** Campos que hay que seleccionar de Payment para netear en memoria. */
export const PAYMENT_NET_FIELDS = { id: true, reversalOfId: true } as const

/** Σ amountPyg de pagos CONFIRMED (las reversiones restan por su signo). */
export function sumConfirmed(payments: readonly Rowish[]): number {
  return payments.reduce((total, pago) => ((pago.status ?? 'CONFIRMED') === 'CONFIRMED' ? total + numero(pago.amountPyg) : total), 0)
}

/** Monto en la moneda original con el signo de amountPyg (la reversión guarda originalAmount positivo). */
export function signedOriginalAmount(pago: { originalAmount?: unknown; amountPyg: bigint | number | null | undefined; reversalOfId?: string | null }): number {
  const monto = Number(pago.originalAmount ?? pago.amountPyg)
  return pago.reversalOfId ? -Math.abs(monto) : monto
}

/** Pagos que cuentan como cobro individual: sin reversiones ni originales revertidos. */
export function countablePayments<T extends Rowish>(payments: readonly T[]): T[] {
  const reversed = new Set(payments.map((pago) => pago.reversalOfId).filter((id): id is string => !!id))
  return payments.filter((pago) => !pago.reversalOfId && !(pago.id && reversed.has(pago.id)))
}

/** Marca por pago si cuenta en un conteo (para agregadores que reciben filas sueltas). */
export function countFlags<T extends Rowish>(payments: readonly T[]): Array<T & { countable: boolean }> {
  const reversed = new Set(payments.map((pago) => pago.reversalOfId).filter((id): id is string => !!id))
  return payments.map((pago) => ({ ...pago, countable: !pago.reversalOfId && !(pago.id && reversed.has(pago.id)) }))
}

