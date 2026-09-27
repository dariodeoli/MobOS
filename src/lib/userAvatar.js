import { API_URL } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { avatarDemo } from '@/lib/demo/avatares'
import { crearCacheAvatar } from '@/lib/avatarCache'

// Foto de perfil del usuario: se pide una vez por pestaña y se guarda como data
// URL para poder mostrarla en la configuración y en las cronologías. La caché
// guarda la *promesa* para que dos componentes que la pidan a la vez compartan
// la misma descarga (antes el segundo recibía un vacío provisorio y quedaba sin
// foto hasta recargar).
//
// #271: al cambiar o quitar la foto, `olvidarAvatar` invalida la caché y avisa
// a todos los avatares montados (antes seguían con la foto vieja). Además la
// descarga va con `cache: 'no-store'`: el endpoint tiene URL fija y el navegador
// podía servir la imagen anterior desde su caché HTTP.
async function cargarAvatar(userId) {
  // La demo no pide fotos al API (#192): usa el retrato ficticio del equipo
  // demo, determinista por id (#219).
  if (!API_URL || isDemoRuntime) return isDemoRuntime ? avatarDemo(userId) : ''
  try {
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/avatar`, {
      credentials: 'include',
      headers: { Accept: 'image/*' },
      cache: 'no-store',
    })
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

/** Invalida la foto de un usuario y avisa a todos los componentes montados. */
export function olvidarAvatar(userId) {
  cache.olvidar(userId)
}

/** Se suscribe a los cambios de foto; devuelve la baja. */
export function suscribirAvatar(callback) {
  return cache.suscribir(callback)
}
