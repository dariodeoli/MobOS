// Foto de perfil del usuario: data URL cacheada por usuario para poder
// mostrarla en la configuración, el topbar y las cronologías.
//
// Estrategia (#271 + #284):
// - `cargarAvatar` descarga con `cache: 'no-cache'` y manda `If-None-Match`
//   cuando hay ETag guardado: el servidor responde 304 si no cambió. Nunca se
//   sirve una foto vieja desde la caché HTTP (URL fija).
// - La caché (`avatarCache`) guarda el valor en memoria **y** en localStorage
//   por usuario: `avatarCacheado()` lo lee de forma síncrona para pintar en el
//   primer render (sin flash de iniciales) y la revalidación corre en segundo
//   plano; si la foto cambió, avisa por `mobos:avatar-cambio`.
// - `olvidarAvatar()` limpia memoria + persistencia (subir/quitar la foto) y
//   `limpiarAvatarCache()` borra todo (cierre de sesión en equipos compartidos).
// - `precargarAvatar()` queda expuesto para el arranque de sesión (el hook vive
//   en `lib/sesion.jsx`, de PLT: se engancha desde ahí sin tocar este módulo).
import { API_URL } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { avatarDemo } from '@/lib/demo/avatares'
import { crearAlmacenAvatar, crearCacheAvatar } from '@/lib/avatarCache'

async function cargarAvatar(userId, { etag = '' } = {}) {
  // La demo no pide fotos al API (#192): usa el retrato ficticio del equipo
  // demo, determinista por id (#219).
  if (!API_URL || isDemoRuntime) return isDemoRuntime ? avatarDemo(userId) : ''
  try {
    // `no-cache` fuerza revalidar el ETag en cada uso (#271): si la foto cambió
    // o se quitó, el navegador no puede servir la anterior desde su caché.
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/avatar`, {
      credentials: 'include',
      cache: 'no-cache',
      headers: { Accept: 'image/*', ...(etag ? { 'If-None-Match': etag } : {}) },
    })
    if (response.status === 304) return { noModificado: true }
    if (!response.ok) return { url: '', borrada: response.status === 404 }
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return { url: '' }
    const url = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/') ? reader.result : '')
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
    return { url, etag: response.headers.get('etag') || '' }
  } catch { return { url: '', error: true } }
}

// La demo no persiste nada: su retrato es ficticio y determinista (#219).
const almacen = !isDemoRuntime && typeof localStorage !== 'undefined' ? crearAlmacenAvatar(localStorage) : null
const cache = crearCacheAvatar(cargarAvatar, { almacen })

export function getAvatarDataUrl(userId) {
  return cache.obtener(userId)
}

/** Lectura síncrona del data URL cacheado (primer render sin flash, #284). */
export function avatarCacheado(userId) {
  return cache.cacheado(userId)
}

export function olvidarAvatar(userId) {
  cache.olvidar(userId)
}

export function suscribirAvatar(callback) {
  return cache.suscribir(callback)
}

/**
 * Arranca la descarga/cacheo de la foto sin esperar el render (#284): pensado
 * para llamarse cuando la sesión resuelve (hook de `lib/sesion.jsx`, PLT).
 */
export function precargarAvatar(userId) {
  if (!userId) return
  getAvatarDataUrl(userId).catch(() => { /* best-effort */ })
}

/** Borra la caché persistente de fotos (cierre de sesión, #284). */
export function limpiarAvatarCache() {
  cache.limpiar()
}
