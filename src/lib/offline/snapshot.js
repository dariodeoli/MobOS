// Copia privada por contexto autenticado completo. La clave local NO autoriza:
// todas las escrituras siguen sujetas al servidor. La generación solo corta carreras.
import { crearStoreDeSnapshots } from './idb.js'

const VERSION = 2
export function contextoPrivadoSnapshot(contexto) {
  if (!contexto?.empresaId || !contexto?.userId || !contexto?.rol || !Array.isArray(contexto?.permisos)) return null
  if (contexto.permisos.some(permiso => typeof permiso !== 'string')) return null
  return { empresaId: contexto.empresaId, sucursalId: contexto.sucursalId || null, userId: contexto.userId, rol: contexto.rol, permisos: [...new Set(contexto.permisos)].sort() }
}
const firma = contexto => JSON.stringify(contexto)

const AVISO_INVALIDACION = 'mobos:private-snapshot-invalidation'
function marcadorActual() {
  try { return globalThis.localStorage?.getItem(AVISO_INVALIDACION) || '' } catch { return '' }
}
export function crearSnapshotsPrivados({ store = crearStoreDeSnapshots(), alInvalidar = () => {}, leerMarcador = marcadorActual } = {}) {
  let generacion = 0
  let activo = null
  let purgaFallida = false
  let cola = Promise.resolve()
  const vigente = token => Boolean(token && token === activo && token.generacion === generacion && token.marcador === leerMarcador())
  function serializar(operacion) {
    const resultado = cola.then(operacion)
    cola = resultado.catch(error => console.error('[offline] no se pudo actualizar el respaldo privado:', error?.name || 'Error'))
    return resultado
  }
  function invalidar({ siGeneracion, difundir = true } = {}) {
    if (siGeneracion !== undefined && siGeneracion !== generacion) return Promise.resolve(false)
    generacion++
    activo = null
    alInvalidar({ difundir })
    // Solo snapshots; jamás cola/ventas no sincronizadas.
    return serializar(async () => {
      try { await store.limpiar(); purgaFallida = false; return true }
      catch (error) { console.warn('[offline] no se pudo purgar el respaldo privado:', error?.name || 'Error'); purgaFallida = true; return false }
    })
  }
  function activar(contexto) {
    const normalizado = contextoPrivadoSnapshot(contexto)
    const identidad = normalizado ? firma(normalizado) : null
    if (activo?.identidad === identidad && vigente(activo)) return activo
    if (activo || !normalizado) void invalidar()
    if (!normalizado) return null
    activo = Object.freeze({ identidad, contexto: normalizado, generacion, marcador: leerMarcador(), clave: `catalogo:v2:${identidad}` })
    return activo
  }
  return {
    activar, invalidar, vigente,
    generacion: () => generacion,
    async guardar(token, datos) {
      if (!vigente(token) || !datos) return false
      try {
        return await serializar(async () => {
          if (!vigente(token)) return false
          await store.guardar(token.clave, { ...datos, version: VERSION, contexto: token.contexto, marcador: token.marcador })
          if (vigente(token)) purgaFallida = false
          // Un logout durante IndexedDB se serializa después y borra esta escritura.
          return vigente(token)
        })
      } catch (error) { console.warn('[offline] no se pudo guardar el respaldo privado:', error?.name || 'Error'); return false }
    },
    async leer(token) {
      if (!vigente(token)) return null
      try {
        await cola
        if (!vigente(token) || purgaFallida) return null
        const fila = await store.leer(token.clave)
        if (!vigente(token) || fila?.datos?.version !== VERSION || fila.datos.marcador !== token.marcador || firma(contextoPrivadoSnapshot(fila.datos.contexto)) !== token.identidad) return null
        return fila.datos
      } catch (error) { console.warn('[offline] no se pudo leer el respaldo privado:', error?.name || 'Error'); return null }
    },
  }
}

const invalidaciones = new Set()
const snapshots = crearSnapshotsPrivados({ alInvalidar: ({ difundir }) => {
  for (const fn of invalidaciones) fn()
  if (difundir) {
    try { globalThis.localStorage?.setItem(AVISO_INVALIDACION, globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random()}`) } catch { /* almacenamiento no disponible */ }
  }
} })
globalThis.window?.addEventListener?.('storage', event => {
  if (event.key === AVISO_INVALIDACION) void snapshots.invalidar({ difundir: false })
})
export const activarContextoSnapshots = contexto => snapshots.activar(contexto)
export const snapshotVigente = token => snapshots.vigente(token)
export const generacionSnapshots = () => snapshots.generacion()
export const invalidarSnapshotsPrivados = opciones => snapshots.invalidar(opciones)
export const guardarSnapshotCatalogo = (token, datos) => snapshots.guardar(token, datos)
export const leerSnapshotCatalogo = token => snapshots.leer(token)
export const borrarSnapshotCatalogo = () => snapshots.invalidar()
export function alInvalidarSnapshots(fn) { invalidaciones.add(fn); return () => invalidaciones.delete(fn) }

const DENEGACIONES = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'ACCESS_DENIED', 'MEMBERSHIP_REQUIRED', 'SUBSCRIPTION_REQUIRED'])
export function esDenegacionPrivada(error) {
  return [401, 402, 403].includes(Number(error?.status)) || DENEGACIONES.has(error?.code) || DENEGACIONES.has(error?.details?.code)
}
export function permiteRespaldoOffline(error) {
  if (!error || esDenegacionPrivada(error) || Number(error.status) > 0) return false
  return ['NETWORK_ERROR', 'REQUEST_TIMEOUT'].includes(error.code) || (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
}
