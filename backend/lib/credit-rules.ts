// Regla pura del crédito de una venta (sin base de datos): la usan el servidor
// y las pruebas. Ver credit-authorization.ts para el flujo completo.
// La copia del front vive en src/lib/credito.js y tiene que dar EXACTAMENTE lo
// mismo (hay un test de paridad en backend/tests/credit-authorization.test.ts).

export const TOLERANCE_PCT_OPTIONS = [0, 10, 20, 30] as const

export type CreditEvaluation = {
  limitPyg: number
  debtPyg: number
  unpaidPyg: number
  /** Disponible contra el límite propio (sin tolerancia). */
  availablePyg: number
  /** Tolerancia aplicada (0, 10, 20 o 30 por ciento del límite). */
  tolerancePct: number
  /** Tope automático = floor(límite × (100 + pct) / 100). */
  capPyg: number
  /** Disponible contra el tope (límite + tolerancia). */
  capAvailablePyg: number
  /** Lo que la venta pasa del TOPE; es lo que hay que autorizar. */
  overPyg: number
  /** Lo que la venta pasa del límite a secas (puede estar cubierto por la tolerancia). */
  overLimitPyg: number
  /** Pasa sola gracias a la tolerancia (sobre el límite, dentro del tope). */
  toleranceUsed: boolean
  noLimit: boolean
  requiresAuthorization: boolean
}

/** Tolerancia válida: solo 0, 10, 20 o 30; cualquier otro valor cae a 0 (sin tolerancia). */
export function normalizeTolerancePct(value: unknown): number {
  const n = Number(value)
  return (TOLERANCE_PCT_OPTIONS as readonly number[]).includes(n) ? n : 0
}

/** Tope automático en enteros: floor(límite × (100 + pct) / 100). */
export function creditCapPyg(limitPyg: number, tolerancePct: number): number {
  const limit = Math.max(0, Math.trunc(Number(limitPyg) || 0))
  const total = limit * (100 + normalizeTolerancePct(tolerancePct))
  return (total - (total % 100)) / 100
}

/**
 * Regla pura: `debtPyg` es la deuda abierta del cliente SIN este pedido y
 * `unpaidPyg` lo que esta venta deja sin cobrar. Sin límite configurado (0 o
 * nulo) el disponible es 0: toda venta a crédito pide autorización. Con
 * tolerancia, hasta el tope pasa sola (y queda auditada como uso de tolerancia).
 */
export function evaluateCreditSale(input: { limitPyg: number; debtPyg: number; unpaidPyg: number; tolerancePct?: number }): CreditEvaluation {
  const limitPyg = Math.max(0, Math.trunc(Number(input.limitPyg) || 0))
  const debtPyg = Math.max(0, Math.trunc(Number(input.debtPyg) || 0))
  const unpaidPyg = Math.max(0, Math.trunc(Number(input.unpaidPyg) || 0))
  const tolerancePct = limitPyg > 0 ? normalizeTolerancePct(input.tolerancePct) : 0
  const capPyg = creditCapPyg(limitPyg, tolerancePct)
  const availablePyg = Math.max(0, limitPyg - debtPyg)
  const capAvailablePyg = Math.max(0, capPyg - debtPyg)
  const overLimitPyg = Math.max(0, debtPyg + unpaidPyg - limitPyg)
  const overPyg = Math.max(0, debtPyg + unpaidPyg - capPyg)
  return {
    limitPyg, debtPyg, unpaidPyg, availablePyg, tolerancePct, capPyg, capAvailablePyg, overPyg, overLimitPyg,
    toleranceUsed: unpaidPyg > 0 && overLimitPyg > 0 && overPyg === 0,
    noLimit: limitPyg <= 0,
    requiresAuthorization: unpaidPyg > 0 && overPyg > 0,
  }
}
