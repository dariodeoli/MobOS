// Tráfico propio del sitio público y de la demo (panel de plataforma →
// «Tráfico y demo»). Reglas puras, sin base de datos: validación estricta de
// lo que llega del navegador. No se guarda IP, agente de usuario ni ningún dato
// personal: solo un id anónimo aleatorio, la ruta sin query y campos acotados.
export const EVENTOS_PERMITIDOS = ['pageview', 'engage', 'demo_start', 'demo_view', 'demo_end', 'cta_registro'] as const
export type NombreEvento = (typeof EVENTOS_PERMITIDOS)[number]
export const TIPOS_PERMITIDOS = ['landing', 'demo'] as const
export const ROLES_DEMO_PERMITIDOS = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO', 'REPARTIDOR'] as const
export const DISPOSITIVOS = ['mobile', 'tablet', 'desktop'] as const
export const MAX_CUERPO_BYTES = 2048
export const MAX_DURACION_SEG = 4 * 3600
export const BUCKETS_SCROLL = [0, 25, 50, 75, 100] as const

export type EventoSitio = {
  kind: (typeof TIPOS_PERMITIDOS)[number]
  name: NombreEvento
  visitorId: string
  path: string | null
  referrer: string | null
  utmSource: string | null
  device: (typeof DISPOSITIVOS)[number]
  role: string | null
  module: string | null
  durationSec: number | null
  scrollPct: number | null
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|facebookexternalhit|whatsapp|preview|monitor|uptime|curl|wget|python-requests|httpclient|go-http|java\//i

export function esBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 8) return true
  return BOT.test(userAgent)
}

export function clasificarDispositivo(userAgent: string | null | undefined): (typeof DISPOSITIVOS)[number] {
  const ua = userAgent ?? ''
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Navegadores que piden no ser medidos (DNT / Global Privacy Control). */
export function pideNoSerMedido(headers: Pick<Headers, 'get'>): boolean {
  return headers.get('dnt') === '1' || headers.get('sec-gpc') === '1'
}

/** Cae al escalón de scroll alcanzado: 0, 25, 50, 75 o 100. */
export function bucketScroll(pct: unknown): number | null {
  const n = Number(pct)
  if (!Number.isFinite(n) || n < 0) return null
  const tope = Math.min(100, n)
  return [...BUCKETS_SCROLL].reverse().find(b => tope >= b) ?? 0
}

/** Solo el host del referente (sin ruta ni query), en minúsculas; null = directo. */
export function normalizarReferente(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null
  try {
    const host = new URL(valor.trim()).hostname.toLowerCase().replace(/^www\./, '')
    return /^[a-z0-9.-]{1,80}$/.test(host) ? host : null
  } catch {
    return null
  }
}

function textoCorto(valor: unknown, patron: RegExp, max: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().toLowerCase().slice(0, max)
  return limpio && patron.test(limpio) ? limpio : null
}

/** Ruta sin query ni hash; null si no es una ruta segura. */
export function normalizarRuta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const ruta = valor.split(/[?#]/)[0].slice(0, 120)
  return /^\/[A-Za-z0-9/_\-.]*$/.test(ruta) ? ruta : null
}

function entero(valor: unknown, max: number): number | null {
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n)) : null
}

/** Valida y reduce el cuerpo a los campos permitidos; null si no es un evento válido. */
export function validarEvento(cuerpo: unknown, userAgent: string | null | undefined): EventoSitio | null {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null
  const b = cuerpo as Record<string, unknown>
  if (typeof b.name !== 'string' || !(EVENTOS_PERMITIDOS as readonly string[]).includes(b.name)) return null
  if (typeof b.kind !== 'string' || !(TIPOS_PERMITIDOS as readonly string[]).includes(b.kind)) return null
  if (typeof b.visitorId !== 'string' || !/^[a-f0-9]{32}$/.test(b.visitorId)) return null
  const rol = typeof b.role === 'string' && (ROLES_DEMO_PERMITIDOS as readonly string[]).includes(b.role) ? b.role : null
  const nombre = b.name as NombreEvento
  if (b.kind === 'demo' && ['demo_start', 'demo_end'].includes(nombre) && !rol) return null
  return {
    kind: b.kind as EventoSitio['kind'],
    name: nombre,
    visitorId: b.visitorId,
    path: normalizarRuta(b.path),
    referrer: normalizarReferente(b.referrer),
    utmSource: textoCorto(b.utmSource, /^[a-z0-9_.\-]+$/, 40),
    device: clasificarDispositivo(userAgent),
    role: rol,
    module: textoCorto(b.module, /^[a-z0-9\-]+$/, 40),
    durationSec: nombre === 'engage' || nombre === 'demo_end' ? entero(b.durationSec, MAX_DURACION_SEG) : null,
    scrollPct: nombre === 'engage' ? bucketScroll(b.scrollPct) : null,
  }
}

export function promedio(valores: ReadonlyArray<number | null | undefined>): number | null {
  const buenos = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return buenos.length ? Math.round((buenos.reduce((a, b) => a + b, 0) / buenos.length) * 10) / 10 : null
}

/** Porcentaje con un decimal; null si el total es 0 (nunca inventa un 0 %). */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null
}
