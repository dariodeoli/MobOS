import { API_URL } from '@/lib/api/client'

// Logo de la empresa para comprobantes y documentos, por variante ('light' =
// para modo claro, 'dark' = para modo oscuro). Se pide una sola vez por pestaña
// y se guarda como data URL para incrustarlo en el HTML que se imprime. La
// caché guarda la promesa para que dos consumidores compartan la descarga.
const cache = new Map()

async function cargarLogo(variant) {
  if (!API_URL) return ''
  try {
    const response = await fetch(`${API_URL}/api/tenant/logo?variant=${encodeURIComponent(variant)}`, { credentials: 'include', headers: { Accept: 'image/*' } })
    if (!response.ok) return ''
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return ''
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/') ? reader.result : '')
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch { return '' }
}

export function getLogoDataUrl(variant = 'light') {
  if (!cache.has(variant)) cache.set(variant, cargarLogo(variant))
  return cache.get(variant)
}

// Variante del logo según el fondo activo (regla #163): fondo oscuro → logo
// claro ('dark'); fondo claro → logo oscuro ('light'). El tema oscuro se marca
// con la clase `dark` en <html> (index.html la aplica desde localStorage).
export function varianteDeTema() {
  try {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function olvidarLogo(variant) {
  if (variant) cache.delete(variant)
  else cache.clear()
}
