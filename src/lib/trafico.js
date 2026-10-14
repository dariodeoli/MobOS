// Medición propia del sitio público y de la demo (panel de plataforma →
// «Tráfico y demo»). Anónima: id aleatorio en localStorage, sin IP ni datos
// personales. Respeta «No rastrear» (DNT / Global Privacy Control). Nunca
// bloquea ni demora la página: envío fire-and-forget y todo error se traga acá
// (el servidor registra los suyos).
const CLAVE_VISITANTE = 'mobos:vid'

// ── Puro (probado en trafico.test.js) ──────────────────────────────────────
export function moduloDeRuta(pathname) {
  const segmento = String(pathname || '').split(/[?#]/)[0].split('/').filter(Boolean)[0] || 'inicio'
  const limpio = segmento.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return limpio.slice(0, 40) || 'inicio'
}

export function utmDeBusqueda(search) {
  try {
    const valor = new URLSearchParams(search || '').get('utm_source')
    const limpio = (valor || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)
    return limpio || null
  } catch { return null }
}

/** Avance máximo de scroll como porcentaje del documento (0–100). */
export function scrollMaximoPct({ scrollTop, altoVentana, altoDocumento }) {
  const recorrible = (Number(altoDocumento) || 0) - (Number(altoVentana) || 0)
  if (recorrible <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((Number(scrollTop) || 0) / recorrible) * 100)))
}

export function esEnlaceDeRegistro(href) {
  return /(^|\/)(login|registro|registrarse|crear-cuenta)(\/|\?|#|$)/i.test(String(href || ''))
}

export function noMedir(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true || (typeof window !== 'undefined' && window.doNotTrack === '1')
}

export function nuevoId() {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// ── Navegador ──────────────────────────────────────────────────────────────
let idMemoria = null
export function idVisitante() {
  try {
    const guardado = localStorage.getItem(CLAVE_VISITANTE)
    if (guardado && /^[a-f0-9]{32}$/.test(guardado)) return guardado
    const nuevo = nuevoId()
    localStorage.setItem(CLAVE_VISITANTE, nuevo)
    return nuevo
  } catch {
    idMemoria = idMemoria || nuevoId()
    return idMemoria
  }
}

const API = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')

/** Envía un evento sin esperar respuesta. Nunca lanza. */
export function enviarEvento(evento) {
  try {
    if (!API || noMedir()) return
    const cuerpo = JSON.stringify({ ...evento, visitorId: idVisitante() })
    const url = `${API}/api/public/track`
    // text/plain: es una petición «simple» (sin preflight) y cabe en sendBeacon.
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([cuerpo], { type: 'text/plain' }))) return
    fetch(url, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' }).catch(() => {})
  } catch { /* la medición jamás rompe la página */ }
}
