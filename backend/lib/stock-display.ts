// Preferencias de presentación del Stock (#448): qué tipo de artículo y qué
// condición se muestran primero y los colores por condición y depósito.
// Viven en Tenant.settings.stockDisplay (JSON, sin migración). Todo lo que llega
// del cliente pasa por `sanitizeStockDisplay`: solo claves conocidas, colores
// #rrggbb y como mucho 60 depósitos.

export const STOCK_TIPOS_PRIMERO = ['', 'EQUIPO', 'ACCESORIO', 'REPUESTO', 'OTRO'] as const
export const STOCK_CONDICIONES_PRIMERO = ['', 'nuevo', 'semi'] as const
export type StockTipoPrimero = (typeof STOCK_TIPOS_PRIMERO)[number]
export type StockCondicionPrimero = (typeof STOCK_CONDICIONES_PRIMERO)[number]
export type StockColorCondicion = { nuevo?: string; semi?: string }
export type StockDisplay = {
  tipoPrimero: StockTipoPrimero
  condicionPrimero: StockCondicionPrimero
  /** Clave: id del depósito, o «*» para todos. Valor: color de fondo por condición. */
  colores: Record<string, StockColorCondicion>
}

export const STOCK_DISPLAY_MAX_DEPOSITOS = 60
const HEX = /^#[0-9a-fA-F]{6}$/

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function emptyStockDisplay(): StockDisplay {
  return { tipoPrimero: '', condicionPrimero: '', colores: {} }
}

export function sanitizeStockDisplay(input: unknown): StockDisplay {
  const raw = asRecord(input)
  const tipo = (STOCK_TIPOS_PRIMERO as readonly string[]).includes(String(raw.tipoPrimero)) ? raw.tipoPrimero as StockTipoPrimero : ''
  const condicion = (STOCK_CONDICIONES_PRIMERO as readonly string[]).includes(String(raw.condicionPrimero)) ? raw.condicionPrimero as StockCondicionPrimero : ''
  const colores: Record<string, StockColorCondicion> = {}
  for (const [clave, valor] of Object.entries(asRecord(raw.colores))) {
    if (Object.keys(colores).length >= STOCK_DISPLAY_MAX_DEPOSITOS) break
    if (!/^[A-Za-z0-9_*-]{1,64}$/.test(clave)) continue
    const item = asRecord(valor)
    const limpio: StockColorCondicion = {}
    if (typeof item.nuevo === 'string' && HEX.test(item.nuevo)) limpio.nuevo = item.nuevo.toLowerCase()
    if (typeof item.semi === 'string' && HEX.test(item.semi)) limpio.semi = item.semi.toLowerCase()
    if (limpio.nuevo || limpio.semi) colores[clave] = limpio
  }
  return { tipoPrimero: tipo, condicionPrimero: condicion, colores }
}

/** Lee la preferencia de Tenant.settings con forma estable. */
export function stockDisplayFrom(settings: unknown): StockDisplay {
  return sanitizeStockDisplay(asRecord(settings).stockDisplay)
}
