import { API_URL } from '@/lib/api/client'

// Foto de perfil del usuario: se pide una vez por pestaña y se guarda como data
// URL para poder mostrarla en la configuración y en las cronologías. La caché
// guarda la *promesa* para que dos componentes que la pidan a la vez compartan
// la misma descarga (antes el segundo recibía un vacío provisorio y quedaba sin
// foto hasta recargar).
const cache = new Map()

async function cargarAvatar(userId) {
  if (!API_URL) return ''
  try {
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/avatar`, { credentials: 'include', headers: { Accept: 'image/*' } })
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

export function getAvatarDataUrl(userId) {
  if (!userId) return Promise.resolve('')
  if (!cache.has(userId)) cache.set(userId, cargarAvatar(userId))
  return cache.get(userId)
}

export function olvidarAvatar(userId) {
  if (userId) cache.delete(userId)
}
