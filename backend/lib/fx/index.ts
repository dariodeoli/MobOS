import { melizecheProvider } from './melizeche'
import { fxSourceLabel } from './sources'
import { FxUnavailableError } from './types'
import type { FxCurrency, FxProvider, FxQuote } from './types'

export * from './types'
export * from './sources'
export { fxSettingsFrom, validateFxSettings, pickRate } from './settings'
export type { FxSettings, FxRule } from './settings'

// Caché por fuente y moneda, compartida entre empresas (cada empresa solo
// elige cuál leer). TTL de 10 minutos; si el proveedor cae, se sirve el último
// valor conocido marcado como desactualizado.
export const FX_TTL_MS = 10 * 60 * 1000

type Entry = { at: number; quote: FxQuote }
const cache = new Map<string, Entry>()
let inflight: Promise<void> | null = null
// Tras una caída no se reintenta el proveedor en cada pedido (cada intento espera
// hasta el timeout): se descansa 30 s y se sirve lo último conocido.
let failedAt = 0
const RETRY_AFTER_FAILURE_MS = 30 * 1000
let providers: FxProvider[] = [melizecheProvider]

const key = (source: string, currency: string) => `${source}:${currency}`

/** Solo pruebas: reemplaza proveedores y vacía la caché. */
export function __setFxProvidersForTest(next: FxProvider[]) { providers = next; cache.clear(); inflight = null; failedAt = 0 }

async function refresh(now: number): Promise<void> {
  if (!inflight && failedAt && now - failedAt < RETRY_AFTER_FAILURE_MS) throw new Error('Proveedor de cotización en pausa tras una falla reciente.')
  if (!inflight) {
    inflight = (async () => {
      let last: unknown = null
      for (const provider of providers) {
        try {
          for (const quote of await provider.fetchAll()) cache.set(key(quote.source, quote.currency), { at: now, quote })
          failedAt = 0
          return
        } catch (cause) { last = cause; console.error(`[fx] proveedor ${provider.id} falló:`, cause) }
      }
      failedAt = now
      throw last instanceof Error ? last : new Error('Sin proveedores de cotización.')
    })().finally(() => { inflight = null })
  }
  return inflight
}

export type FxResult = { quote: FxQuote; sourceLabel: string; fetchedAt: string; cached: boolean; stale: boolean }

function result(entry: Entry, cached: boolean, stale: boolean): FxResult {
  return { quote: entry.quote, sourceLabel: fxSourceLabel(entry.quote.source), fetchedAt: new Date(entry.at).toISOString(), cached, stale }
}

export async function getFxQuote(source: string, currency: FxCurrency, now = Date.now()): Promise<FxResult> {
  const hit = cache.get(key(source, currency))
  if (hit && now - hit.at < FX_TTL_MS) return result(hit, true, false)
  try {
    await refresh(now)
    const next = cache.get(key(source, currency))
    if (next && next !== hit) return result(next, false, false)
    // El proveedor respondió pero esta fuente/moneda no vino: sin dato nuevo.
    if (hit) return result(hit, true, true)
    throw new FxUnavailableError(`${fxSourceLabel(source)} no informa cotización de ${currency}. Cargala manualmente.`, 'fx_currency_unavailable')
  } catch (cause) {
    if (cause instanceof FxUnavailableError) throw cause
    if (hit) return result(hit, true, true)
    throw new FxUnavailableError('No se pudo obtener la cotización. Cargala manualmente.')
  }
}
