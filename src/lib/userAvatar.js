import { API_URL } from '@/lib/api/client'

// Foto de perfil del usuario: se pide una vez por pestaña y se guarda como data
// URL para poder mostrarla en la configuración y en las cronologías.
const cache = new Map()

export async function getAvatarDataUrl(userId) {
  if (!userId) return ''
  if (cache.has(userId)) return cache.get(userId)
  cache.set(userId, '')
  if (!API_URL) return ''
  try {
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/avatar`, { credentials: 'include', headers: { Accept: 'image/*' } })
    if (!response.ok) return ''
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return ''
    const data = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/') ? reader.result : '')
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
    cache.set(userId, data)
    return data
  } catch { return '' }
}

export function olvidarAvatar(userId) {
  if (userId) cache.delete(userId)
}
