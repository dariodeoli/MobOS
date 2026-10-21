// Cotización automática (#401): la fuente y el lado los elige cada empresa en
// Configuración → Comercial (por defecto Cambios Chaco · venta). Se pide con un
// caché corto por pestaña y SIEMPRE queda editable a mano: si el servicio no
// responde, devuelve null y la persona la carga ella.
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'

// Demo: cotización ficticia fija (sin servicio externo).
const FX_DEMO = { rate: 7300, source: 'demo', sourceLabel: 'Cotización de ejemplo (demo)', side: 'venta', updatedAt: null, fetchedAt: null, stale: false }

const TTL_MS = 5 * 60 * 1000
const cache = new Map()
const enCurso = new Map()

function normalizar(data) {
  const rate = Number(data?.rate ?? data?.referencialDiario ?? data?.venta ?? data?.compra) || 0
  if (!(rate > 0)) return null
  return {
    rate,
    source: data.source || null,
    sourceLabel: data.sourceLabel || null,
    side: data.side || null,
    updatedAt: data.updatedAt || null,
    fetchedAt: data.fetchedAt || null,
    stale: Boolean(data.stale),
  }
}

/**
 * Cotización completa para `purpose` ('sales' para cobros, 'costs' para costos)
 * y moneda: {rate, source, sourceLabel, side, updatedAt, stale} o null. Con
 * `forzar` se salta el caché de la pestaña (botón «actualizar»).
 */
export async function cotizacionFx({ purpose = 'sales', currency = 'USD', forzar = false } = {}) {
  if (isDemoRuntime) return currency === 'USD' || currency === 'BRL' ? { ...FX_DEMO, rate: currency === 'BRL' ? 1400 : FX_DEMO.rate } : null
  const clave = `${purpose}:${currency}`
  const hit = cache.get(clave)
  if (!forzar && hit && Date.now() - hit.at < TTL_MS) return hit.info
  if (!enCurso.has(clave)) {
    enCurso.set(clave, api
      .get(`/api/fx?purpose=${purpose}&currency=${currency}`)
      .then((data) => {
        const info = normalizar(data)
        if (info) cache.set(clave, { at: Date.now(), info })
        return info
      })
      .catch(() => null)
      .finally(() => { enCurso.delete(clave) }))
  }
  return enCurso.get(clave)
}

/** Solo el número, para los costos en USD (Compras / unidades). */
export async function cotizacionReferencia() {
  const info = await cotizacionFx({ purpose: 'costs', currency: 'USD' })
  return info ? info.rate : null
}
