// Listas de precios por cliente: normalización de los ítems que llegan por la
// API. Centralizarla evita que POST y PATCH acepten combinaciones distintas
// (producto vs categoría, precio fijo vs descuento, escalones inválidos).

const INT_MAX = 2147483647

export class PriceListInputError extends Error {}

export type NormalizedPriceItem = {
  scope: 'PRODUCT' | 'CATEGORY'
  productId: string | null
  category: string | null
  unitPricePyg: number | null
  unitPriceUsd: number | null
  discountPct: number | null
  tiers: Array<{ minQty: number; unitPricePyg: number }>
}

const texto = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim()) throw new PriceListInputError(`${label} es obligatorio.`)
  const limpio = value.trim()
  if (limpio.length > max) throw new PriceListInputError(`${label} no puede superar ${max} caracteres.`)
  return limpio
}

function montoPyg(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > INT_MAX) throw new PriceListInputError('El precio en guaraníes debe ser un entero válido.')
  return number
}

function montoUsd(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 999999999999.99) throw new PriceListInputError('El precio en USD es inválido.')
  return number
}

function porcentaje(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 100) throw new PriceListInputError('El descuento debe ser un porcentaje entre 0 y 100.')
  return number
}

/**
 * Valida los ítems de una lista. `undefined` significa "no tocar los ítems";
 * un arreglo (posiblemente vacío) reemplaza el conjunto completo. Cada ítem
 * define exactamente un origen de precio y los escalones solo tienen sentido en
 * guaraníes.
 */
export function parsePriceListItems(input: unknown): NormalizedPriceItem[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) throw new PriceListInputError('Los ítems deben enviarse como una lista.')
  if (input.length > 300) throw new PriceListInputError('Una lista admite hasta 300 ítems.')
  const vistos = new Set<string>()
  return input.map((row, index): NormalizedPriceItem => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new PriceListInputError(`Ítem ${index + 1}: datos inválidos.`)
    const item = row as Record<string, unknown>
    const scope = item.scope === 'PRODUCT' ? 'PRODUCT' : item.scope === 'CATEGORY' ? 'CATEGORY' : null
    if (!scope) throw new PriceListInputError(`Ítem ${index + 1}: el alcance debe ser PRODUCT o CATEGORY.`)
    const productId = scope === 'PRODUCT' ? texto(item.productId, 'Producto', 128) : null
    const category = scope === 'CATEGORY' ? texto(item.category, 'Categoría', 120) : null
    const unitPricePyg = montoPyg(item.unitPricePyg)
    const unitPriceUsd = montoUsd(item.unitPriceUsd)
    const discountPct = porcentaje(item.discountPct)
    const origenes = [unitPricePyg, unitPriceUsd, discountPct].filter(value => value !== null).length
    if (origenes === 0) throw new PriceListInputError(`Ítem ${index + 1}: definí un precio en guaraníes, un precio en USD o un descuento.`)
    if (origenes > 1) throw new PriceListInputError(`Ítem ${index + 1}: usá un solo origen de precio (monto en Gs, monto en USD o descuento), no varios.`)
    const clave = scope === 'PRODUCT' ? `P:${productId}` : `C:${category!.toLocaleLowerCase()}`
    if (vistos.has(clave)) throw new PriceListInputError(`Ítem ${index + 1}: ya hay un ítem para ese ${scope === 'PRODUCT' ? 'producto' : 'categoría'}.`)
    vistos.add(clave)
    const tiersInput = item.tiers === undefined || item.tiers === null ? [] : item.tiers
    if (!Array.isArray(tiersInput)) throw new PriceListInputError(`Ítem ${index + 1}: los escalones deben enviarse como lista.`)
    if (tiersInput.length > 20) throw new PriceListInputError(`Ítem ${index + 1}: hasta 20 escalones por ítem.`)
    if (tiersInput.length && unitPricePyg === null && discountPct === null) throw new PriceListInputError(`Ítem ${index + 1}: los escalones por cantidad se expresan en guaraníes.`)
    const minQtyVistos = new Set<number>()
    const tiers = tiersInput.map((tier, tierIndex): { minQty: number; unitPricePyg: number } => {
      if (!tier || typeof tier !== 'object' || Array.isArray(tier)) throw new PriceListInputError(`Ítem ${index + 1}, escalón ${tierIndex + 1}: datos inválidos.`)
      const fila = tier as Record<string, unknown>
      const minQty = Number(fila.minQty)
      if (!Number.isSafeInteger(minQty) || minQty < 1 || minQty > INT_MAX) throw new PriceListInputError(`Ítem ${index + 1}, escalón ${tierIndex + 1}: la cantidad mínima debe ser un entero positivo.`)
      if (minQtyVistos.has(minQty)) throw new PriceListInputError(`Ítem ${index + 1}: la cantidad mínima ${minQty} está repetida.`)
      minQtyVistos.add(minQty)
      const precio = montoPyg(fila.unitPricePyg)
      if (precio === null) throw new PriceListInputError(`Ítem ${index + 1}, escalón ${tierIndex + 1}: falta el precio en guaraníes.`)
      return { minQty, unitPricePyg: precio }
    }).sort((a, b) => a.minQty - b.minQty)
    return { scope, productId, category, unitPricePyg, unitPriceUsd, discountPct, tiers }
  })
}
