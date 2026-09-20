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

// --- Precio efectivo por cliente (issue #28) -------------------------------

export type PriceOrigin = 'TIER' | 'LIST' | 'WHOLESALE' | 'RETAIL' | 'USD'

export type PriceListTierInput = { minQty?: unknown; unitPricePyg?: unknown }

export type PriceListItemInput = {
  scope?: unknown
  productId?: unknown
  category?: unknown
  unitPricePyg?: unknown
  unitPriceUsd?: unknown
  discountPct?: unknown
  tiers?: PriceListTierInput[] | null
}

export type PriceListInput = { currency?: unknown; items?: PriceListItemInput[] | null } | null | undefined

export type PriceResolution = {
  unitPricePyg: number
  origin: PriceOrigin
  currency: 'PYG' | 'USD'
  unitPriceUsd?: number
  // Escalón aplicado (solo cuando origin es TIER) y escalones disponibles del
  // ítem de lista aplicable, para que la UI muestre "3+ unidades · Gs …".
  minQty?: number
  tiers: Array<{ minQty: number; unitPricePyg: number }>
}

// Convierte montos del modelo (Int, Decimal de Prisma o string) a número
// validado. `null`/'' significan "sin dato"; un valor inválido es error.
function amount(value: unknown, label: string): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = typeof value === 'object' && value !== null && 'toNumber' in value
    ? (value as { toNumber(): number }).toNumber()
    : Number(value)
  if (!Number.isFinite(number) || number < 0 || number > INT_MAX) throw new PricingError(`${label} inválido.`)
  return number
}

function percentage(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = amount(value, 'Porcentaje de descuento')
  if (number === undefined) return undefined
  if (number > 100) throw new PricingError('El porcentaje de descuento no puede superar 100.')
  return number
}

/**
 * Precio unitario autoritativo para una venta. Prioridad:
 * 1. escalón por cantidad del ítem de lista aplicable (producto exacto gana
 *    sobre categoría; dentro del ítem gana el mayor minQty <= quantity);
 * 2. ítem de lista (monto en PYG o descuento % sobre el precio minorista);
 * 3. precio mayorista del producto si el cliente lo es y tiene valor;
 * 4. pricePyg; 5. priceUsd (marcado USD, la UI lo muestra aparte).
 * El `priceList` debe venir solo si la lista está activa y es del tenant.
 */
export function resolveUnitPrice(input: {
  product: { id?: string; category?: string | null; pricePyg: unknown; wholesalePricePyg?: unknown; priceUsd?: unknown }
  quantity?: unknown
  customer?: { pricingTier?: string | null } | null
  priceList?: PriceListInput
}): PriceResolution {
  const product = input.product
  const retail = amount(product.pricePyg, 'Precio') ?? 0
  const quantity = int(input.quantity, 1) ? (input.quantity as number) : 1
  const items = Array.isArray(input.priceList?.items) ? input.priceList!.items! : []
  const applicable = items.find(item => item?.scope === 'PRODUCT' && product.id && item.productId === product.id)
    || items.find(item => item?.scope === 'CATEGORY' && !!item.category && !!product.category && item.category === product.category)
    || null

  if (applicable) {
    const tiers = (Array.isArray(applicable.tiers) ? applicable.tiers : []).map(tier => ({
      minQty: Number(tier?.minQty),
      unitPricePyg: amount(tier?.unitPricePyg, 'Precio por cantidad'),
    })).filter(tier => Number.isSafeInteger(tier.minQty) && tier.minQty >= 1 && tier.unitPricePyg !== undefined)
      .map(tier => ({ minQty: tier.minQty as number, unitPricePyg: tier.unitPricePyg as number }))
      .sort((a, b) => a.minQty - b.minQty)
    const applied = tiers.filter(tier => tier.minQty <= quantity).at(-1)
    const fixed = amount(applicable.unitPricePyg, 'Precio de lista')
    const usd = amount(applicable.unitPriceUsd, 'Precio de lista en USD')
    const discountPct = percentage(applicable.discountPct)
    if (applied) return { unitPricePyg: applied.unitPricePyg, origin: 'TIER', currency: 'PYG', minQty: applied.minQty, tiers }
    if (fixed !== undefined) return { unitPricePyg: fixed, origin: 'LIST', currency: 'PYG', tiers }
    if (discountPct !== undefined && discountPct > 0) return { unitPricePyg: Math.round((retail * (100 - discountPct)) / 100), origin: 'LIST', currency: 'PYG', tiers }
    if (usd !== undefined) return { unitPricePyg: 0, origin: 'USD', currency: 'USD', unitPriceUsd: usd, tiers: [] }
  }

  const wholesale = amount(product.wholesalePricePyg, 'Precio mayorista')
  if (input.customer?.pricingTier === 'WHOLESALE' && wholesale !== undefined && wholesale > 0) {
    return { unitPricePyg: wholesale, origin: 'WHOLESALE', currency: 'PYG', tiers: [] }
  }
  if (retail > 0) return { unitPricePyg: retail, origin: 'RETAIL', currency: 'PYG', tiers: [] }
  const usd = amount(product.priceUsd, 'Precio en USD')
  if (usd !== undefined) return { unitPricePyg: 0, origin: 'USD', currency: 'USD', unitPriceUsd: usd, tiers: [] }
  return { unitPricePyg: retail, origin: 'RETAIL', currency: 'PYG', tiers: [] }
}
