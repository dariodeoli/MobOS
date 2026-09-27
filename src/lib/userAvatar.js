import { API_URL } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { avatarDemo } from '@/lib/demo/avatares'
import { crearCacheAvatar } from '@/lib/avatarCache'

// Foto de perfil del usuario: se pide una vez por pestaña y se guarda como data
// URL para poder mostrarla en la configuración y en las cronologías. La caché
// (pura, con invalidación y suscripción) guarda la *promesa* para que dos
// componentes que la pidan a la vez compartan la misma descarga y para que al
// cambiar o quitar la foto todos los avatares montados se enteren (#271).
async function cargarAvatar(userId) {
  // La demo no pide fotos al API (#192): usa el retrato ficticio del equipo
  // demo, determinista por id (#219).
  if (!API_URL || isDemoRuntime) return isDemoRuntime ? avatarDemo(userId) : ''
  try {
    // `no-cache` fuerza revalidar el ETag en cada uso (#271): si la foto cambió
    // o se quitó, el navegador no puede servir la anterior desde su caché.
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/avatar`, { credentials: 'include', cache: 'no-cache', headers: { Accept: 'image/*' } })
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

const cache = crearCacheAvatar(cargarAvatar)

export function getAvatarDataUrl(userId) {
  return cache.obtener(userId)
}

export function olvidarAvatar(userId) {
  cache.olvidar(userId)
}

export function suscribirAvatar(callback) {
  return cache.suscribir(callback)
}
