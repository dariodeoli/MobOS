import { FX_SOURCES } from './sources'
import type { FxProvider, FxQuote } from './types'

// Proveedor dolar.melizeche.com: agrega BCP/SET y las casas de cambio (entre
// ellas Cambios Chaco) en `dolarpy.<casa>.{compra,venta}`, solo para USD.
// Ninguna casa trae BRL/ARS/EUR en esta API (verificado contra el servicio real).
export const MELIZECHE_URL = 'https://dolar.melizeche.com/api/1.0/'
const FETCH_TIMEOUT_MS = 6000

const positive = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** "2026-10-14 16:50:28" (hora de Asunción, UTC-3) → ISO 8601; null si no se entiende. */
export function melizecheTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/)
  if (!match) return null
  const iso = `${match[1]}T${match[2].length === 5 ? `${match[2]}:00` : match[2]}-03:00`
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString()
}

/** Normaliza el payload. Fuentes ausentes, en cero o malformadas se omiten. */
export function parseMelizeche(data: unknown): FxQuote[] {
  if (!data || typeof data !== 'object') return []
  const root = data as Record<string, unknown>
  const dolarpy = root.dolarpy
  if (!dolarpy || typeof dolarpy !== 'object' || Array.isArray(dolarpy)) return []
  const updatedAt = melizecheTimestamp(root.updated)
  const quotes: FxQuote[] = []
  for (const source of Object.keys(FX_SOURCES)) {
    const entry = (dolarpy as Record<string, unknown>)[source]
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const compra = positive(row.compra)
    const venta = positive(row.venta)
    if (compra === null || venta === null) continue
    quotes.push({ source, currency: 'USD', compra, venta, updatedAt, referencial: source === 'bcp' ? positive(row.referencial_diario) : null })
  }
  return quotes
}

export const melizecheProvider: FxProvider = {
  id: 'melizeche',
  async fetchAll(signal) {
    const response = await fetch(MELIZECHE_URL, { signal: signal || AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Cotización no disponible (${response.status}).`)
    const quotes = parseMelizeche(await response.json())
    if (!quotes.length) throw new Error('La respuesta de cotizaciones no trae fuentes válidas.')
    return quotes
  },
}
