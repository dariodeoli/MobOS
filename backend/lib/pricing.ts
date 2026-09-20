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

// ── Resolución del precio de venta ─────────────────────────────────────────
// Prioridad: escalón por cantidad > lista del cliente > mayorista > minorista >
// priceUsd. La lista del cliente se aplica sobre el precio que le
// correspondería (mayorista si lo es, si no minorista), así un descuento nunca
// queda por encima del precio de su tramo.
export type PriceSource = 'TIER' | 'LIST' | 'WHOLESALE' | 'RETAIL' | 'USD'

export type PriceTierInput = { minQuantity: number; unitPricePyg: number }
export type PriceListItemInput = { productId?: string | null; category?: string | null; adjustment?: string | null; valuePct: number | string | { toString(): string } }
export type PriceProductInput = {
  id?: string | null
  category?: string | null
  pricePyg?: number | null
  wholesalePricePyg?: number | null
  // Acepta el Decimal de Prisma (tiene toString) además de número o string.
  priceUsd?: number | string | { toString(): string } | null
}

export type ResolvePriceInput = {
  quantity: number
  product: PriceProductInput
  tiers?: PriceTierInput[] | null
  priceList?: { id?: string; items: PriceListItemInput[] } | null
  customerPricingTier?: string | null
  // Cotización del dólar para el precio en USD. Sin ella, el precio en USD
  // queda informado pero no se convierte: nunca se inventa un tipo de cambio.
  usdRatePyg?: number | null
}

export type ResolvedPrice = {
  unitPricePyg: number
  source: PriceSource
  tierMinQuantity: number | null
  priceListId: string | null
  priceUsd: number | null
  usdRatePyg: number | null
}

const numero = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const porcentaje = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new PricingError('El descuento/recargo de la lista debe estar entre 0 y 100%.')
  return Math.round(parsed * 100) / 100
}

const aplicarAjuste = (base: number, item: PriceListItemInput) => {
  const pct = porcentaje(item.valuePct)
  const ajuste = item.adjustment === 'SURCHARGE' ? 1 + pct / 100 : 1 - pct / 100
  const precio = Math.round(base * ajuste)
  if (!int(precio)) throw new PricingError('El precio de la lista queda fuera de rango.')
  return precio
}

// Ítem que corresponde al producto: primero el del producto exacto y, si no
// hay, el de su categoría.
function itemDeLista(items: PriceListItemInput[], product: PriceProductInput) {
  const producto = items.find((item) => item.productId && product.id && item.productId === product.id)
  if (producto) return producto
  const categoria = typeof product.category === 'string' ? product.category.trim().toLowerCase() : ''
  if (!categoria) return undefined
  return items.find((item) => !item.productId && typeof item.category === 'string' && item.category.trim().toLowerCase() === categoria)
}

export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const quantity = Math.max(1, Math.floor(numero(input.quantity) || 1))
  const product = input.product || {}
  const retail = numero(product.pricePyg)
  const wholesale = numero(product.wholesalePricePyg)
  const esMayorista = input.customerPricingTier === 'WHOLESALE' && wholesale > 0
  const usd = numero(product.priceUsd)
  const ratePyg = numero(input.usdRatePyg)
  const usdRatePyg = ratePyg > 0 ? ratePyg : null
  const priceUsd = usd > 0 ? usd : null

  // 1. Escalón por cantidad: el tramo más alto alcanzado.
  const escalones = (input.tiers || []).filter((tier) => int(tier.minQuantity, 1) && int(tier.unitPricePyg) && quantity >= tier.minQuantity)
  if (escalones.length) {
    const elegido = escalones.reduce((mejor, tier) => (tier.minQuantity > mejor.minQuantity ? tier : mejor))
    return { unitPricePyg: elegido.unitPricePyg, source: 'TIER', tierMinQuantity: elegido.minQuantity, priceListId: null, priceUsd, usdRatePyg }
  }

  // 2. Lista propia del cliente (si cubre el producto o su categoría).
  const base = esMayorista ? wholesale : retail > 0 ? retail : priceUsd && usdRatePyg ? Math.round(priceUsd * usdRatePyg) : 0
  if (input.priceList && base > 0) {
    const item = itemDeLista(input.priceList.items || [], product)
    if (item) return { unitPricePyg: aplicarAjuste(base, item), source: 'LIST', tierMinQuantity: null, priceListId: input.priceList.id ?? null, priceUsd, usdRatePyg }
  }

  // 3. Mayorista del producto para clientes mayoristas.
  if (esMayorista) return { unitPricePyg: wholesale, source: 'WHOLESALE', tierMinQuantity: null, priceListId: null, priceUsd, usdRatePyg }

  // 4. Minorista.
  if (retail > 0) return { unitPricePyg: retail, source: 'RETAIL', tierMinQuantity: null, priceListId: null, priceUsd, usdRatePyg }

  // 5. Precio en dólares (se convierte solo si hay cotización).
  return { unitPricePyg: priceUsd && usdRatePyg ? Math.round(priceUsd * usdRatePyg) : 0, source: 'USD', tierMinQuantity: null, priceListId: null, priceUsd, usdRatePyg }
}
