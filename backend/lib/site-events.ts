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
export const RETENCION_DIAS = 90
export const OTRAS = 'otras'

// Listas cerradas (acotan la cardinalidad de la tabla: lo que no está acá se
// guarda como «otras»). Mantener alineadas con las rutas de src/App.jsx.
// Rutas públicas de la landing + primer tramo de cada pantalla de la demo.
export const MODULOS_DEMO = [
  'inicio', 'pos', 'ventas', 'pedidos', 'delivery', 'clientes', 'productos', 'promociones', 'precios', 'abastecimiento',
  'compras-centro', 'preparacion', 'preparar-lote', 'recepcion', 'metricas', 'cotizaciones', 'plantillas', 'trade-in',
  'compras', 'servicio', 'garantias', 'autorizaciones', 'resumen', 'configuracion', 'ayuda', 'mi-cuenta', 'analisis',
  'finanzas', 'stock', 'inventario', 'control', 'celulares', 'comparador', 'centro-control', 'tradein',
] as const
export const RUTAS_LANDING = ['status', 'privacidad', 'terminos', 'login', 'demo', 'registro', 'registrarse', 'crear-cuenta'] as const
const TRAMOS_PERMITIDOS: ReadonlySet<string> = new Set<string>([...RUTAS_LANDING, ...MODULOS_DEMO.filter(m => m !== 'inicio')])
const MODULOS_SET: ReadonlySet<string> = new Set<string>(MODULOS_DEMO)

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
    return host.length <= 80 && /^[a-z0-9.-]+$/.test(host) ? host : null
  } catch {
    return null
  }
}

function textoCorto(valor: unknown, patron: RegExp, max: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().toLowerCase().slice(0, max)
  return limpio && patron.test(limpio) ? limpio : null
}

/**
 * Ruta sin query ni hash, reducida a su primer tramo si es conocido
 * («/pos/abc/123» → «/pos»); cualquier otra ruta segura → «otras».
 * null si no es una ruta bien formada.
 */
export function normalizarRuta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const ruta = valor.split(/[?#]/)[0].slice(0, 120)
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(ruta)) return null
  const tramo = ruta.split('/').filter(Boolean)[0]?.toLowerCase()
  if (!tramo) return '/'
  return TRAMOS_PERMITIDOS.has(tramo) ? `/${tramo}` : OTRAS
}

/** Módulo de la demo: solo los conocidos; el resto → «otras». */
export function normalizarModulo(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null
  const m = valor.trim().toLowerCase().slice(0, 40)
  return MODULOS_SET.has(m) ? m : OTRAS
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
    utmSource: textoCorto(b.utmSource, /^[a-z0-9_-]{1,40}$/, 40),
    device: clasificarDispositivo(userAgent),
    role: rol,
    module: normalizarModulo(b.module),
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

/**
 * Lee el cuerpo por stream con tope duro (no confía en content-length: una
 * petición chunked no lo trae). null = se pasó del tope (se corta la lectura).
 */
export async function leerCuerpoAcotado(request: Pick<Request, 'body'>, maxBytes = MAX_CUERPO_BYTES): Promise<string | null> {
  const stream = request.body
  if (!stream) return ''
  const reader = stream.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    partes.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(partes))
}

// Retención: se purgan los eventos con más de RETENCION_DIAS, como mucho una
// vez por día por proceso (perezoso, lo dispara el propio endpoint).
let ultimaPurga = 0
export function resetPurgaParaPruebas() {
  ultimaPurga = 0
}

export async function purgarEventosViejos(
  db: { siteEvent: { deleteMany: (args: { where: { createdAt: { lt: Date } } }) => Promise<{ count: number }> } },
  ahora = Date.now(),
): Promise<number | null> {
  if (ahora - ultimaPurga < 24 * 60 * 60 * 1000) return null
  ultimaPurga = ahora
  const { count } = await db.siteEvent.deleteMany({ where: { createdAt: { lt: new Date(ahora - RETENCION_DIAS * 24 * 60 * 60 * 1000) } } })
  return count
}
