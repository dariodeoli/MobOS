import { InputError } from './payment-input'

// Pedido especial con seña: la venta se toma con un anticipo (seña) y una fecha
// esperada de llegada/entrega; el saldo se cobra después con el mismo camino de
// pagos de cualquier venta. Este módulo concentra el parseo de la marca y el
// cálculo del saldo para poder probarlos con bordes (seña mayor al total, seña
// más un cobro parcial, venta cerrada) sin duplicar la regla en las rutas.

export const INT_MAX = 2147483647

export type SpecialOrderFields = { isSpecialOrder: boolean; expectedAt: Date | null }

// La fecha esperada llega del input date como `YYYY-MM-DD`; se fija al mediodía
// local para que no se corra un día por zona horaria. También acepta un ISO
// completo (la API pública) y nunca acepta una fecha inválida.
export function parseExpectedAt(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new InputError('La fecha esperada debe ser una fecha.')
  const raw = value.trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw)
  if (Number.isNaN(date.getTime())) throw new InputError('La fecha esperada es inválida.')
  return date
}

// La marca y la fecha viajan juntas: una fecha sin pedido especial es un error
// del cliente, no un dato a ignorar en silencio.
export function parseSpecialOrder(input: { specialOrder?: unknown; expectedAt?: unknown }): SpecialOrderFields {
  if (input.specialOrder !== undefined && typeof input.specialOrder !== 'boolean') throw new InputError('La marca de pedido especial debe ser booleana.')
  const isSpecialOrder = input.specialOrder === true
  if (!isSpecialOrder && input.expectedAt !== undefined && input.expectedAt !== null && input.expectedAt !== '') throw new InputError('La fecha esperada solo aplica a un pedido especial.')
  return { isSpecialOrder, expectedAt: isSpecialOrder ? parseExpectedAt(input.expectedAt) : null }
}

export type PaymentLike = { status?: string | null; amountPyg?: number | null }

// Saldo del pedido: total menos pagos confirmados. La seña es un pago parcial
// más (no hay circuito paralelo), así que entra en la misma suma. Un excedente
// se informa en vez de esconderse: sirve para rechazar el sobrepago.
export function summarizeBalance(totalPyg: number, payments: PaymentLike[]): { totalPyg: number; collectedPyg: number; balancePyg: number; excessPyg: number } {
  const total = Number.isSafeInteger(totalPyg) && totalPyg >= 0 ? totalPyg : 0
  const collectedPyg = payments.reduce((sum, payment) => {
    if ((payment.status ?? 'CONFIRMED') !== 'CONFIRMED') return sum
    const amount = Number(payment.amountPyg)
    return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  return { totalPyg: total, collectedPyg, balancePyg: Math.max(0, total - collectedPyg), excessPyg: Math.max(0, collectedPyg - total) }
}

export type ChargeValidation =
  | { ok: true; balancePyg: number; collectedPyg: number }
  | { ok: false; code: 'CLOSED_ORDER' | 'INVALID_AMOUNT' | 'OVER_BALANCE'; message: string }

// Una venta cancelada o ya completada no admite cobros nuevos.
export function orderAcceptsCharges(status?: string | null): boolean {
  return status !== 'CANCELLED' && status !== 'COMPLETED'
}

// Cobro contra el saldo pendiente. Es la regla que comparten el alta de la
// venta y el registro de pagos: nunca se cobra más que el saldo, y una venta
// cancelada o ya completada no admite cobros nuevos.
export function validateCharge(input: { totalPyg: number; collectedPyg: number; amountPyg: number; status?: string | null }): ChargeValidation {
  if (!orderAcceptsCharges(input.status)) return { ok: false, code: 'CLOSED_ORDER', message: 'La venta no admite nuevos pagos.' }
  const amount = Number(input.amountPyg)
  const total = Number(input.totalPyg)
  const collected = Number(input.collectedPyg)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > INT_MAX || !Number.isSafeInteger(total) || total < 0 || total > INT_MAX || !Number.isSafeInteger(collected) || collected < 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'El pago supera el total de la venta.' }
  }
  if (collected + amount > total) return { ok: false, code: 'OVER_BALANCE', message: 'El pago supera el total de la venta.' }
  return { ok: true, collectedPyg: collected, balancePyg: total - collected - amount }
}
