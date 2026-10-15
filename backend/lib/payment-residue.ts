// Saldo residual por redondeo (#461): al cobrar en una moneda extranjera (USD, BRL…) el monto se
// convierte a guaraníes y redondea. Si lo que queda por cobrar es menor a UN CENTAVO de esa
// moneda (rate / 100 Gs; p. ej. Gs 7 con el dólar a 7.350), ya no se puede cobrar en esa moneda:
// la venta no se cierra con ese saldo escondido, se completa en guaraníes. Es la misma regla de
// «Completar en Gs» del POS (src/utils/pagoCuenta.js, residuoSubCentavo), pero con la autoridad
// del servidor: la UI puede mentir o ir desactualizada, el servidor no.

export type PaymentForResidue = { currency?: string | null; exchangeRatePyg?: unknown; status?: string | null }

/** Guaraníes que quedan por cobrar si son menos de un centavo de la última moneda extranjera cobrada; si no, 0. */
export function subCentResidue(pendingPyg: number, payments: readonly PaymentForResidue[]): number {
  const pending = Math.round(Number(pendingPyg) || 0)
  if (!(pending > 0)) return 0
  for (let index = payments.length - 1; index >= 0; index -= 1) {
    const payment = payments[index]
    if ((payment.status ?? 'CONFIRMED') !== 'CONFIRMED') continue
    const currency = String(payment.currency ?? 'PYG').toUpperCase()
    // Decide el último cobro confirmado: si ya se completó en guaraníes no hay residuo de redondeo.
    if (currency === 'PYG') return 0
    const rate = Number(payment.exchangeRatePyg)
    return Number.isFinite(rate) && rate > 0 && pending < rate / 100 ? pending : 0
  }
  return 0
}

export const residueMessage = (pendingPyg: number) =>
  `Queda un saldo de Gs ${Math.round(pendingPyg).toLocaleString('es-PY')}, menor a un centavo de la moneda cobrada: no se puede cobrar en esa moneda. Completalo en guaraníes (efectivo) para cerrar la venta.`
