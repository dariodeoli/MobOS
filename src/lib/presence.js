// Reglas puras de presencia compartidas por el tracker y la píldora del topbar.
export const VENTANA_EN_LINEA_MS = 75_000
export const INTERVALO_LATIDO_MS = 30_000

export function estaEnLinea(lastSeenAt, ahora = Date.now()) {
  if (!lastSeenAt) return false
  const visto = new Date(lastSeenAt).getTime()
  return Number.isFinite(visto) && ahora - visto <= VENTANA_EN_LINEA_MS
}

export function alcanceDeRuta(pathname) {
  const parte = String(pathname || '').split('/').filter(Boolean)[0]
  return parte ? parte.slice(0, 60) : null
}

export function inicialesDe(name) {
  const palabras = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!palabras.length) return '?'
  const primera = Array.from(palabras[0])[0]
  const ultima = palabras.length > 1 ? Array.from(palabras[palabras.length - 1])[0] : ''
  return `${primera}${ultima}`.toLocaleUpperCase('es')
}

export function etiquetaPresencia(personas) {
  const nombres = personas.map((persona) => persona.name).join(', ')
  return `${nombres} · ${personas.length} en línea`
}
