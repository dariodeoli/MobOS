// Código interno de unidad (#400): `<SIGLA>-<correlativo>`, p. ej. MOV-0001.
// El correlativo (InventoryUnit.internalSeq) lo asigna el trigger
// InventoryUnit_assign_internal_seq por empresa y nunca se reutiliza; acá solo
// se formatea, se interpreta para la búsqueda y se resuelve la sigla.
// Es solo interno: no va en etiquetas ni en comprobantes del cliente.
const PREFIX_PATTERN = /^[A-Z]{2,4}$/
const CODE_PATTERN = /^([A-Z]{2,4})-?(\d{1,9})$/
const MAX_SEQ = 2147483647
const FALLBACK_PREFIX = 'UNI'

// Sigla configurable por la empresa: 2–4 letras mayúsculas. Devuelve null si no
// es válida (el llamador decide si es un error o un «sin configurar»).
export function normalizeUnitCodePrefix(value: unknown): string | null {
  const prefix = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return PREFIX_PATTERN.test(prefix) ? prefix : null
}

// Iniciales del nombre de la empresa («Móvil Store SA» → MSS); con una sola
// palabra, sus tres primeras letras. Sin acentos y solo letras.
export function unitCodeInitials(name: string | null | undefined): string | null {
  const palabras = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  if (!palabras.length) return null
  const sigla = palabras.length === 1 ? palabras[0].slice(0, 3) : palabras.map(palabra => palabra[0]).join('').slice(0, 4)
  return sigla.length >= 2 ? sigla : null
}

// Prioridad: sigla propia → prefijo de pedidos → iniciales → UNI.
export function resolveUnitCodePrefix(tenant: { unitCodePrefix?: string | null; orderPrefix?: string | null; name?: string | null } | null | undefined): string {
  return normalizeUnitCodePrefix(tenant?.unitCodePrefix) ?? normalizeUnitCodePrefix(tenant?.orderPrefix) ?? unitCodeInitials(tenant?.name) ?? FALLBACK_PREFIX
}

// MOV-0001: mínimo 4 dígitos y crece sin cortar (MOV-10234). Sin correlativo
// (unidad creada antes del trigger o fila nueva sin guardar) no hay código.
export function formatUnitCode(prefix: string, seq: number | null | undefined): string | null {
  if (seq === null || seq === undefined || !Number.isSafeInteger(seq) || seq < 1) return null
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

// Búsqueda por código: «MOV-0042», «mov42» o «MOV-10234» → { prefix, seq }.
// Acepta con o sin guion y cualquier cantidad de ceros a la izquierda.
export function parseUnitCode(query: unknown): { prefix: string; seq: number } | null {
  const match = CODE_PATTERN.exec(String(query ?? '').trim().toUpperCase())
  if (!match) return null
  const seq = Number(match[2])
  return Number.isSafeInteger(seq) && seq >= 1 && seq <= MAX_SEQ ? { prefix: match[1], seq } : null
}

// Ícono de ubicación: set fijo (el front lo dibuja). Null/vacío lo quita;
// cualquier otro valor es inválido (undefined).
export const LOCATION_ICONS = ['DEPOSITO', 'VITRINA', 'CAJA_FUERTE', 'TALLER', 'TRANSITO', 'PRESTAMO'] as const
export type LocationIcon = typeof LOCATION_ICONS[number]
export function parseLocationIcon(value: unknown): LocationIcon | null | undefined {
  if (value === null || value === '') return null
  return typeof value === 'string' && (LOCATION_ICONS as readonly string[]).includes(value.trim().toUpperCase()) ? value.trim().toUpperCase() as LocationIcon : undefined
}

// Proveedor: modo de visualización y color.
export const SUPPLIER_DISPLAY_MODES = ['ABREVIADO', 'COMPLETO'] as const
export type SupplierDisplayMode = typeof SUPPLIER_DISPLAY_MODES[number]
export function parseSupplierDisplayMode(value: unknown): SupplierDisplayMode | undefined {
  return typeof value === 'string' && (SUPPLIER_DISPLAY_MODES as readonly string[]).includes(value.trim().toUpperCase()) ? value.trim().toUpperCase() as SupplierDisplayMode : undefined
}
export function parseHexColor(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  const color = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^#[0-9a-f]{6}$/.test(color) ? color : undefined
}
// Ícono del proveedor: identificador corto de un set del front (letras, números, guion).
export function parseSupplierIcon(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  const icon = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z0-9_-]{1,32}$/.test(icon) ? icon : undefined
}

// Ciclos de batería: entero 0–5000. Vacío/null lo quita; inválido → undefined.
export function parseBatteryCycles(value: unknown): number | null | undefined {
  if (value === null || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,5}$/.test(value.trim()) ? Number(value) : NaN
  return Number.isSafeInteger(n) && n >= 0 && n <= 5000 ? n : undefined
}

// Fin de garantía: siempre el primer día del mes (UTC). Acepta «YYYY-MM»,
// «YYYY-MM-DD» o una fecha ISO; vacío/null lo quita; inválido → undefined.
export function parseWarrantyUntil(value: unknown): Date | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  const match = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T.*)?)?$/.exec(text)
  if (!match) return undefined
  const year = Number(match[1]), month = Number(match[2])
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return undefined
  if (match[3] !== undefined) {
    const day = Number(match[3])
    if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || (text.length > 10 && Number.isNaN(new Date(text).getTime()))) return undefined
  }
  return new Date(Date.UTC(year, month - 1, 1))
}
