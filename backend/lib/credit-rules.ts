// Regla pura del crédito de una venta (sin base de datos): la usan el servidor
// y las pruebas. Ver credit-authorization.ts para el flujo completo.

export type CreditEvaluation = {
  limitPyg: number
  debtPyg: number
  unpaidPyg: number
  availablePyg: number
  overPyg: number
  noLimit: boolean
  requiresAuthorization: boolean
}

/**
 * Regla pura: `debtPyg` es la deuda abierta del cliente SIN este pedido y
 * `unpaidPyg` lo que esta venta deja sin cobrar. Sin límite configurado (0 o
 * nulo) el disponible es 0: toda venta a crédito pide autorización.
 */
export function evaluateCreditSale(input: { limitPyg: number; debtPyg: number; unpaidPyg: number }): CreditEvaluation {
  const limitPyg = Math.max(0, Math.trunc(Number(input.limitPyg) || 0))
  const debtPyg = Math.max(0, Math.trunc(Number(input.debtPyg) || 0))
  const unpaidPyg = Math.max(0, Math.trunc(Number(input.unpaidPyg) || 0))
  const availablePyg = Math.max(0, limitPyg - debtPyg)
  const overPyg = Math.max(0, debtPyg + unpaidPyg - limitPyg)
  return { limitPyg, debtPyg, unpaidPyg, availablePyg, overPyg, noLimit: limitPyg <= 0, requiresAuthorization: unpaidPyg > 0 && overPyg > 0 }
}
