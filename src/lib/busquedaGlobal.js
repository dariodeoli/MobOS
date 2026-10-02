// #296 · Estados de la búsqueda global: sin resultados, servicio no disponible
// y error de conexión, además del fallback local/demo. Puro y testeable: la
// pantalla decide con esto qué mostrar y cuándo caer a los datos locales.

export const MENSAJES_BUSQUEDA = {
  conexion: 'Sin conexión: no se pudo consultar la tienda. Revisá tu red y reintentá.',
  servicio: 'El servicio no está disponible en este momento. Reintentá en unos minutos.',
}

/**
 * Clasifica el fallo de una consulta:
 * - `null`: no es una caída que deba mostrarse (401/403/404: rol o dato ausente).
 * - `'servicio'`: el servidor respondió 5xx.
 * - `'conexion'`: no hubo respuesta (red caída, fetch abortado, sin señal).
 */
export function clasificarFallo(causa) {
  const status = Number(causa?.status || causa?.response?.status || 0)
  if (status === 401 || status === 403 || status === 404) return null
  if (status >= 500) return 'servicio'
  return 'conexion'
}

/**
 * Estado visible de la búsqueda:
 * - `listo`: hay resultados (aunque algún grupo haya fallado).
 * - `conexion` / `servicio`: no hubo resultados y al menos un grupo falló.
 * - `vacio`: la consulta corrió completa y no encontró nada.
 */
export function estadoBusqueda({ resultados = [], fallos = [] } = {}) {
  if (resultados.length > 0) return 'listo'
  if (fallos.includes('conexion')) return 'conexion'
  if (fallos.includes('servicio')) return 'servicio'
  return 'vacio'
}

/** Mensaje para el estado de error ('' cuando no corresponde). */
export function mensajeDeEstado(estado) {
  return MENSAJES_BUSQUEDA[estado] || ''
}

const normalizar = (texto) => String(texto || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Filtro local por título/detalle, sin distinguir mayúsculas ni acentos. */
export function filtrarLocal(filas = [], q, campos = ['titulo', 'subtitulo']) {
  const termino = normalizar(q)
  if (!termino) return []
  return filas.filter((fila) => campos.some((campo) => normalizar(fila?.[campo]).includes(termino)))
}
