// Fotos de perfil de los usuarios demo (#219).
//
// Son retratos ilustrados ficticios, embebidos como data URI: no hay llamadas
// externas ni datos reales, y viven solo en la pestaña (session-only, #201).
// El mismo id devuelve siempre la misma foto (determinista), así el equipo demo
// se ve igual en Equipo, topbar, cronologías y firmas de inventario.

const FONDOS = ['#dbeafe', '#fce7f3', '#dcfce7', '#fef3c7', '#ede9fe', '#cffafe']
const PIELES = ['#f3c6a5', '#d9a074', '#c68642', '#8d5524', '#f1c27d', '#e0ac69']
const PELOS = ['#2f2a26', '#4a3728', '#6b4f3a', '#1f2937', '#7c3aed', '#b45309']
const ROPAS = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

// Retrato plano: fondo, hombros, cuello, cabeza, pelo y ojos. Simple y legible
// a 20-36 px, como una foto de perfil de la app.
function retrato(i) {
  const fondo = FONDOS[i % FONDOS.length]
  const piel = PIELES[i % PIELES.length]
  const pelo = PELOS[(i + 2) % PELOS.length]
  const ropa = ROPAS[(i + 4) % ROPAS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${fondo}"/><path d="M10 64c2-12 11-18 22-18s20 6 22 18z" fill="${ropa}"/><rect x="27" y="34" width="10" height="10" rx="4" fill="${piel}"/><circle cx="32" cy="26" r="12" fill="${piel}"/><path d="M20 24a12 12 0 0 1 24 0c0-8-5-12-12-12s-12 4-12 12z" fill="${pelo}"/><circle cx="27" cy="26" r="1.6" fill="#1f2937"/><circle cx="37" cy="26" r="1.6" fill="#1f2937"/><path d="M28 31c2 2 6 2 8 0" stroke="#9a5b4f" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const AVATARES_DEMO = FONDOS.map((_, i) => retrato(i))

// Foto del usuario demo: determinista por id, solo para ids `demo-*` (los
// usuarios del equipo ficticio). Fuera de la demo devuelve vacío.
export function avatarDemo(userId) {
  const id = String(userId || '')
  if (!id.startsWith('demo-')) return ''
  let suma = 7
  for (const caracter of id) suma = (suma * 31 + caracter.charCodeAt(0)) % 9973
  return AVATARES_DEMO[suma % AVATARES_DEMO.length]
}
