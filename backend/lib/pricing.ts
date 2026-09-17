// Reglas de precio compartidas: descuento por línea, totales de cotización y
// días de garantía automática. Centralizarlas evita que cada ruta las
// reinterprete con diferencias sutiles.

export class PricingError extends Error {}

const INT_MAX = 2147483647
const int = (value: unknown, min = 0) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= INT_MAX

export function lineDiscount(input: { quantity: number; unitPricePyg: number; discountPyg?: number; discountPct?: number }) {
  const { quantity, unitPricePyg } = input
  const discountPyg = input.discountPyg ?? 0
  if (!int(discountPyg)) throw new PricingError('Descuento fijo de línea inválido.')
  const discountPct = input.discountPct
  if (discountPct !== undefined && (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100)) throw new PricingError('Porcentaje de descuento de línea inválido.')
  if (discountPyg > 0 && discountPct !== undefined) throw new PricingError('Usá descuento fijo o porcentual por línea, no ambos.')
  const base = quantity * unitPricePyg
  const discount = discountPyg > 0 ? discountPyg : discountPct !== undefined && discountPct > 0 ? Math.round((base * discountPct) / 100) : 0
  if (discount > base) throw new PricingError('El descuento no puede superar el precio de la línea.')
  if (!int(base - discount)) throw new PricingError('Total de línea fuera de rango seguro.')
  return { basePyg: base, discountPyg: discount, totalPyg: base - discount }
}

// La garantía automática usa los días del producto o el default por condición.
export function warrantyDaysFor(input: { condition?: string | null; warrantyDays?: number | null }) {
  if (input.warrantyDays !== undefined && input.warrantyDays !== null) return Math.max(0, Math.min(730, Math.floor(input.warrantyDays)))
  return input.condition === 'NEW' ? 365 : 90
}

export function quoteTotals(items: Array<{ quantity: number; unitPricePyg: number }>, discountPyg = 0) {
  if (!Array.isArray(items) || items.length === 0) throw new PricingError('La cotización necesita al menos un ítem.')
  let subtotal = 0
  for (const item of items) {
    if (!int(item.quantity, 1) || !int(item.unitPricePyg)) throw new PricingError('Cantidad y precio deben ser enteros válidos.')
    const line = item.quantity * item.unitPricePyg
    if (!int(line)) throw new PricingError('El total de una línea excede el rango permitido.')
    subtotal += line
    if (!int(subtotal)) throw new PricingError('El subtotal excede el rango permitido.')
  }
  if (!int(discountPyg) || discountPyg > subtotal) throw new PricingError('Descuento inválido.')
  return { subtotalPyg: subtotal, discountPyg, totalPyg: subtotal - discountPyg }
}
