// Iniciales de un nombre (primera y última palabra). Única implementación de
// la app: la usa el Avatar y los lugares que solo necesitan el texto.
export function inicialesDe(nombre = '') {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!palabras.length) return '?'
  const primera = Array.from(palabras[0])[0]
  const ultima = palabras.length > 1 ? Array.from(palabras[palabras.length - 1])[0] : ''
  return `${primera}${ultima}`.toLocaleUpperCase('es')
}
