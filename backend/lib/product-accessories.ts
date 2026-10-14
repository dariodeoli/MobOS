// #404: categorías de accesorios (separadas de Product.category, que es texto
// libre y alimenta la política de seguro) y modelos compatibles.
export const ACCESSORY_CATEGORIES = ['LAMINA', 'CASE', 'CABLE', 'CARGADOR', 'AUDIO', 'OTRO'] as const
export type AccessoryCategory = (typeof ACCESSORY_CATEGORIES)[number]

export function isAccessoryCategory(value: unknown): value is AccessoryCategory {
  return typeof value === 'string' && (ACCESSORY_CATEGORIES as readonly string[]).includes(value)
}

/** undefined = no viene en el cuerpo; null = quitar; string válida o error. */
export function parseAccessoryCategory(value: unknown): AccessoryCategory | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const key = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!isAccessoryCategory(key)) throw new Error('Categoría de accesorio inválida.')
  return key
}

/** Lista de modelos sin vacíos ni repetidos (sin distinguir mayúsculas), hasta 20 de 60 caracteres. */
export function parseCompatibleModels(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return []
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n;]/) : null
  if (!raw) throw new Error('Los modelos compatibles deben ser una lista.')
  const seen = new Set<string>()
  const models: string[] = []
  for (const item of raw) {
    const model = typeof item === 'string' ? item.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
    if (!model || seen.has(model.toLowerCase())) continue
    seen.add(model.toLowerCase())
    models.push(model)
  }
  if (models.length > 20) throw new Error('Se admiten hasta 20 modelos compatibles.')
  return models
}

const KEYWORDS: Record<Exclude<AccessoryCategory, 'OTRO'>, string[]> = {
  LAMINA: ['lámina', 'lamina', 'vidrio', 'templado', 'hidrogel'],
  CASE: ['case', 'funda', 'carcasa', 'estuche'],
  CABLE: ['cable'],
  CARGADOR: ['cargador', 'charger', 'adaptador', 'power bank', 'magsafe'],
  AUDIO: ['airpods', 'auricular', 'audífono', 'audifono', 'parlante', 'speaker', 'buds'],
}

/**
 * Filtro de catálogo por categoría de accesorio: la guardada, o —si el producto
 * aún no fue clasificado— una palabra clave en el nombre. undefined = sin filtro.
 */
export function accessoryCatalogFilter(value: unknown) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!isAccessoryCategory(key)) return undefined
  if (key === 'OTRO') return { accessoryCategory: 'OTRO' }
  return { OR: [{ accessoryCategory: key }, { accessoryCategory: null, OR: KEYWORDS[key].map(word => ({ name: { contains: word, mode: 'insensitive' as const } })) }] }
}
