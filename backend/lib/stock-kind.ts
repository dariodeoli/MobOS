// Clasificador de tipo de stock (Product.stockKind). Es la misma regla que usa
// el backfill de la migración 20270103000000_stock_unificado (ILIKE sobre la
// categoría normalizada, ya aplicada en producción: esa subcadena no se reescribe).
// #360: acá el alias debe ser palabra (con plural simple), no subcadena: «showcase»
// o «bandada» ya no caen como accesorio. Los alias salen de
// src/lib/categorias.js y src/lib/categoriasProducto.js.
export type StockKind = 'EQUIPO' | 'ACCESORIO' | 'REPUESTO' | 'OTRO'

export const STOCK_KINDS: readonly StockKind[] = ['EQUIPO', 'ACCESORIO', 'REPUESTO', 'OTRO']

// Orden = prioridad: OTRO (servicios), ACCESORIO («Funda iPhone», «Power bank»), REPUESTO («Pantalla iPhone», «Batería»), EQUIPO.
const ACCESORIO = ['accesorio', 'cable', 'cargador', 'funda', 'vidrio', 'lamina', 'templado', 'adaptador', 'protector', 'soporte', 'audio', 'parlante', 'speaker', 'auricular', 'audifono', 'buds', 'earbuds', 'power bank', 'powerbank', 'bateria portatil', 'bateria externa', 'correa', 'malla', 'banda', 'estuche', 'case']
// Servicios no son stock físico: «Soporte técnico» no es el accesorio «soporte».
const OTRO = ['soporte tecnico', 'servicio']
const REPUESTO = ['repuesto', 'pieza', 'pantalla', 'display', 'modulo', 'bateria']
const EQUIPO = ['iphone', 'mobile', 'celular', 'telefono', 'smartphone', 'macbook', 'imac', 'laptop', 'notebook', 'computadora', 'ipad', 'tablet', 'watch', 'smartwatch', 'reloj', 'airpods', 'mac']

const sinAcentos = (texto: unknown) => String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

// Fuente de las expresiones regulares; el SQL de la migración usa las mismas.
export const STOCK_KIND_PATTERNS = {
  OTRO: OTRO.join('|'),
  ACCESORIO: ACCESORIO.join('|'),
  REPUESTO: REPUESTO.join('|'),
  EQUIPO: EQUIPO.join('|'),
} as const

// Palabra entera (letras a ambos lados no cuentan; los números sí separan: «iPhone15»)
// con plural simple: fundas, cargadores, relojes, auriculares.
const palabra = (alias: readonly string[]) => new RegExp(`(?<![a-z])(?:${alias.join('|')})(?:e?s)?(?![a-z])`)
const regex = {
  OTRO: palabra(OTRO),
  ACCESORIO: palabra(ACCESORIO),
  REPUESTO: palabra(REPUESTO),
  EQUIPO: palabra(EQUIPO),
}

/** Clasifica por categoría; `hasUnits` (tiene IMEI/unidades) fuerza EQUIPO. */
export function classifyStockKind(input: { category?: string | null; hasUnits?: boolean } = {}): StockKind {
  if (input.hasUnits) return 'EQUIPO'
  const texto = sinAcentos(input.category)
  if (!texto) return 'OTRO'
  if (regex.OTRO.test(texto)) return 'OTRO'
  if (regex.ACCESORIO.test(texto)) return 'ACCESORIO'
  if (regex.REPUESTO.test(texto)) return 'REPUESTO'
  if (regex.EQUIPO.test(texto)) return 'EQUIPO'
  return 'OTRO'
}

export function isStockKind(value: unknown): value is StockKind {
  return typeof value === 'string' && (STOCK_KINDS as readonly string[]).includes(value)
}
