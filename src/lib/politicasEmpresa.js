import { apiFetch } from '@/lib/api/client'
import { publicUrls } from '@/lib/urls'
import { urlPoliticas } from '@/lib/politicas'

// Resumen de políticas publicadas para los comprobantes (#433). Se pide una
// vez por pestaña (la caché guarda la promesa) y nunca bloquea la impresión:
// ante cualquier error el comprobante sale con la leyenda general de siempre.
let cache = null

const VACIA = { garantia: '', cambios: '', url: '' }

const base = () => String(import.meta.env?.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') || publicUrls.clientPortal

async function cargar() {
  try {
    const response = await apiFetch('/api/tenant/policies/print', { headers: { Accept: 'application/json' } })
    if (!response.ok) return VACIA
    const datos = await response.json()
    return {
      garantia: String(datos?.garantia || ''),
      cambios: String(datos?.cambios || ''),
      url: urlPoliticas(base(), datos?.slug),
    }
  } catch {
    return VACIA
  }
}

export function getPoliticasImpresion() {
  if (!cache) cache = cargar()
  return cache
}

export function olvidarPoliticasImpresion() {
  cache = null
}
