// Resolución del precio de venta en el POS. Espeja `resolvePrice` de
// `backend/lib/pricing.ts` (prioridad: escalón por cantidad > lista del cliente
// > mayorista > minorista > priceUsd). Los dos lados comparten los mismos casos
// de prueba: si cambia la regla, cambia en los dos y los tests lo delatan.

const numero = (value) => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const porcentaje = (value) => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error('El descuento/recargo de la lista debe estar entre 0 y 100%.')
  return Math.round(parsed * 100) / 100
}

// Ítem de la lista que corresponde al producto: el del producto exacto gana
// sobre el de su categoría.
function itemDeLista(items, product) {
  const producto = (items || []).find((item) => item.productId && product?.id && item.productId === product.id)
  if (producto) return producto
  const categoria = typeof product?.category === 'string' ? product.category.trim().toLowerCase() : ''
  if (!categoria) return undefined
  return (items || []).find((item) => !item.productId && typeof item.category === 'string' && item.category.trim().toLowerCase() === categoria)
}

export function resolverPrecio({ quantity, product, tiers, priceList, customerPricingTier, usdRatePyg } = {}) {
  const cantidad = Math.max(1, Math.floor(numero(quantity) || 1))
  const retail = numero(product?.pricePyg)
  const wholesale = numero(product?.wholesalePricePyg)
  const esMayorista = customerPricingTier === 'WHOLESALE' && wholesale > 0
  const usd = numero(product?.priceUsd)
  const rate = numero(usdRatePyg)
  const tasa = rate > 0 ? rate : null
  const priceUsd = usd > 0 ? usd : null
  const base = { priceUsd, usdRatePyg: tasa }

  const escalones = (tiers || []).filter((tier) => cantidad >= numero(tier.minQuantity) && Number.isSafeInteger(Number(tier.unitPricePyg)))
  if (escalones.length) {
    const elegido = escalones.reduce((mejor, tier) => (Number(tier.minQuantity) > Number(mejor.minQuantity) ? tier : mejor))
    return { unitPricePyg: Number(elegido.unitPricePyg), source: 'TIER', tierMinQuantity: Number(elegido.minQuantity), priceListId: null, ...base }
  }

  const precioBase = esMayorista ? wholesale : retail > 0 ? retail : priceUsd && tasa ? Math.round(priceUsd * tasa) : 0
  if (priceList && precioBase > 0) {
    const item = itemDeLista(priceList.items, product)
    if (item) {
      const pct = porcentaje(item.valuePct)
      const ajuste = item.adjustment === 'SURCHARGE' ? 1 + pct / 100 : 1 - pct / 100
      return { unitPricePyg: Math.round(precioBase * ajuste), source: 'LIST', tierMinQuantity: null, priceListId: priceList.id ?? null, ...base }
    }
  }

  if (esMayorista) return { unitPricePyg: wholesale, source: 'WHOLESALE', tierMinQuantity: null, priceListId: null, ...base }
  if (retail > 0) return { unitPricePyg: retail, source: 'RETAIL', tierMinQuantity: null, priceListId: null, ...base }
  return { unitPricePyg: priceUsd && tasa ? Math.round(priceUsd * tasa) : 0, source: 'USD', tierMinQuantity: null, priceListId: null, ...base }
}

export const ORIGEN_PRECIO = {
  TIER: 'Escalón por cantidad',
  LIST: 'Lista del cliente',
  WHOLESALE: 'Mayorista',
  RETAIL: 'Minorista',
  USD: 'Precio en USD',
}
