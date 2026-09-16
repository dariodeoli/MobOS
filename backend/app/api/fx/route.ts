import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Cotización pública del dólar en Paraguay (BCP y casas de cambio agregadas
// por dolar.melizeche.com). Se usa como referencia para costos en USD; siempre
// queda editable a mano. Caché corta para no depender del proveedor en cada
// tecla y para sobrevivir caídas del servicio.
const TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 6000
let cache: { at: number; payload: Record<string, unknown> } | null = null

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return json({ ...cache.payload, cached: true })
  try {
    const response = await fetch('https://dolar.melizeche.com/api/1.0/', { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Cotización no disponible (${response.status}).`)
    const data = await response.json()
    const dolarpy = data?.dolarpy || {}
    const bcp = dolarpy.bcp || {}
    const payload = {
      source: 'BCP + casas de cambio (dolar.melizeche.com)',
      updated: typeof data?.updated === 'string' ? data.updated : null,
      referencialDiario: Number(bcp.referencial_diario) || null,
      compra: Number(bcp.compra) || null,
      venta: Number(bcp.venta) || null,
      providers: Object.fromEntries(Object.entries(dolarpy).map(([name, value]) => [name, value && typeof value === 'object' ? value : null])),
    }
    if (payload.referencialDiario === null) throw new Error('La cotización no trae el referencial diario del BCP.')
    cache = { at: now, payload }
    return json({ ...payload, cached: false })
  } catch (cause) {
    // Si la caché venció pero existe, sirve como último valor conocido.
    if (cache) return json({ ...cache.payload, cached: true, stale: true })
    return error('No se pudo obtener la cotización del dólar. Cargala manualmente.', 503, { code: 'fx_unavailable', manualEntryAllowed: true })
  }
}
