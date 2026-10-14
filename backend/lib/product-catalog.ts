// #354 · Catálogo del POS paginado en el servidor. Reglas puras (sin base de
// datos) para que la ruta y las pruebas compartan la misma definición.

export const PAGE_SIZE_DEFAULT = 16
export const PAGE_SIZE_MAX = 100
export const QUERY_MAX = 120

/** `page` es 1-based; `pageSize` queda acotado para que una consulta no traiga todo el catálogo. */
export function parseCatalogPage(params: URLSearchParams) {
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(Number(params.get('pageSize'))) || PAGE_SIZE_DEFAULT))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

/** Búsqueda libre: nombre, modelo, color, capacidad, categoría (marca), SKU e IMEI. */
export function catalogSearchFilter(rawQuery: string | null | undefined) {
  const q = (rawQuery || '').trim().slice(0, QUERY_MAX)
  if (!q) return undefined
  const text = (field: string) => ({ [field]: { contains: q, mode: 'insensitive' as const } })
  return { OR: [text('name'), text('model'), text('color'), text('capacity'), text('category'), text('sku'), { imei: { contains: q } }] }
}

export function catalogMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
}
