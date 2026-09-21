// Almacenamiento de la demo (#204): los datos ficticios viven SOLO en memoria
// de la pestaña. Nada se escribe en localStorage ni en IndexedDB, así que al
// recargar o salir se vuelve al seed y ninguna tienda real queda tocada.
//
// Fuera de la demo delega en localStorage: los módulos que todavía tienen un
// camino local (offline/legacy) siguen funcionando igual.
import { isDemoRuntime } from './demoMode.js'

const memoria = new Map()

/** Objeto compatible con la API de storage (getItem/setItem/removeItem). */
export function almacenamientoDemo(opciones = {}) {
  const demo = opciones.demo ?? isDemoRuntime
  if (demo) {
    return {
      getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
      setItem: (clave, valor) => { memoria.set(clave, String(valor)) },
      removeItem: (clave) => { memoria.delete(clave) },
    }
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    /* localStorage bloqueado: seguimos sin persistencia */
  }
  return null
}

export function leerDemo(clave, opciones) {
  try {
    return almacenamientoDemo(opciones)?.getItem(clave) ?? null
  } catch {
    return null
  }
}

export function guardarDemo(clave, valor, opciones) {
  try {
    almacenamientoDemo(opciones)?.setItem(clave, String(valor))
  } catch {
    /* cuota o almacenamiento bloqueado: el dato queda solo en pantalla */
  }
}

export function borrarDemo(clave, opciones) {
  try {
    almacenamientoDemo(opciones)?.removeItem(clave)
  } catch {
    /* noop */
  }
}

/** Solo para pruebas: vacía la memoria de la demo. */
export function limpiarMemoriaDemo() {
  memoria.clear()
}
