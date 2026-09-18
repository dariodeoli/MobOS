// Caché corta de consultas (solo GET) del cliente de API. Pura y testeable: el
// reloj se inyecta. Las mutaciones la limpian entera y los errores de sesión
// (401/402/403) también, así que una pantalla que escribe nunca lee datos
// viejos por más que otra haya consultado hace un instante.

export const CACHE_GET_MS = 3000

export function crearCacheDeConsultas({ ahora = () => Date.now() } = {}) {
  const entradas = new Map()
  return {
    leer(clave) {
      const entrada = entradas.get(clave)
      if (!entrada) return undefined
      if (ahora() >= entrada.vence) {
        entradas.delete(clave)
        return undefined
      }
      return entrada.valor
    },
    guardar(clave, valor, ms = CACHE_GET_MS) {
      if (!(ms > 0)) return
      entradas.set(clave, { valor, vence: ahora() + ms })
    },
    invalidar(clave) {
      entradas.delete(clave)
    },
    invalidarTodo() {
      entradas.clear()
    },
    tamano() {
      return entradas.size
    },
  }
}

// Instancia compartida por el cliente de API de la app.
export const cacheDeConsultas = crearCacheDeConsultas()
