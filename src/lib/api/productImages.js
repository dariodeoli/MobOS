import { api, apiFetch } from './client'
import { alInvalidarSnapshots } from '../offline/snapshot'
import { ApiError } from './errors'

// #404: fotos de producto. Los bytes salen del API con sesión (cookie), así que
// no se pueden poner directo en un <img src>: se bajan como blob y se guardan
// en una caché en memoria acotada (los ids son inmutables).
const enc = encodeURIComponent
const base = (productId) => `/api/products/${enc(productId)}/images`

export const fotosProducto = {
  list: (productId) => api.get(base(productId), { cacheMs: 0 }),
  upload: (productId, { foto, miniatura }) => {
    const form = new FormData()
    form.append('file', foto, foto.name)
    if (miniatura) form.append('thumb', miniatura, miniatura.name)
    return api.post(base(productId), form)
  },
  reorder: (productId, order) => api.patch(base(productId), { action: 'reorder', order }),
  setPrimary: (productId, imageId) => api.patch(base(productId), { action: 'primary', imageId }),
  remove: (productId, imageId) => api.delete(`${base(productId)}/${enc(imageId)}`),
}

/** data:, blob: y http(s): ya son imágenes; el resto es una ruta del API. */
export function esFuenteDirecta(src) {
  return /^(data:|blob:|https?:)/i.test(String(src || ''))
}

const MAX_EN_MEMORIA = 160
let revisionFotos = 0
const invalidaciones = new Set()
export function alInvalidarFotos(fn) { invalidaciones.add(fn); return () => invalidaciones.delete(fn) }

const enMemoria = new Map() // src → Promise<string> (URL de objeto), orden de uso

/** Baja la foto con sesión y devuelve una URL de objeto (reutiliza la ya bajada). */
export function cargarFoto(src) {
  if (!src) return Promise.reject(new Error('Sin foto.'))
  if (esFuenteDirecta(src)) return Promise.resolve(src)
  const guardada = enMemoria.get(src)
  if (guardada) { enMemoria.delete(src); enMemoria.set(src, guardada); return guardada }
  const revision = revisionFotos
  const promesa = apiFetch(src)
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error(`Foto no disponible (${respuesta.status}).`)
      return respuesta.blob()
    })
    .then((blob) => {
      // apiFetch protege las cabeceras; el cuerpo también puede terminar tarde.
      if (revision !== revisionFotos) throw new ApiError('El contexto de acceso cambió.', { code: 'CONTEXT_CHANGED' })
      return URL.createObjectURL(blob)
    })
  promesa.catch(() => { if (enMemoria.get(src) === promesa) enMemoria.delete(src) })
  enMemoria.set(src, promesa)
  while (enMemoria.size > MAX_EN_MEMORIA) {
    const [clave, vieja] = enMemoria.entries().next().value
    enMemoria.delete(clave)
    vieja.then((url) => URL.revokeObjectURL(url), () => {})
  }
  return promesa
}

/** Olvida las fotos bajadas (cierre de sesión o cambio de empresa). */
export function limpiarFotos() {
  revisionFotos++
  for (const fn of invalidaciones) fn()
  for (const promesa of enMemoria.values()) promesa.then((url) => URL.revokeObjectURL(url), () => {})
  enMemoria.clear()
}

// Sesión, empresa, sucursal, rol/permisos y denegación comparten esta frontera.
alInvalidarSnapshots(limpiarFotos)
