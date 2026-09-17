import { API_URL } from '@/lib/api/client'

// Logo de la empresa para comprobantes y documentos. Se pide una sola vez por
// sesión de pestaña y se guarda como data URL para poder incrustarlo en el HTML
// que se imprime (el iframe de impresión no resuelve rutas relativas).
let cache

export async function getLogoDataUrl() {
  if (cache !== undefined) return cache
  cache = ''
  if (!API_URL) return cache
  try {
    const response = await fetch(`${API_URL}/api/tenant/logo`, { credentials: 'include', headers: { Accept: 'image/*' } })
    if (!response.ok) return cache
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return cache
    cache = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/') ? reader.result : '')
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch { cache = '' }
  return cache
}

export function olvidarLogo() {
  cache = undefined
}
