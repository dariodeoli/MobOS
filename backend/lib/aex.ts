import { createHash } from 'node:crypto'

// Adaptador opcional de AEX (envíos) para el catálogo de ciudades. Se activa
// solo cuando existen las credenciales de entorno; sin ellas el autocompletado
// usa el catálogo GeoCity sembrado en la base. Preparado según la
// documentación de la API v1.5.4 (flujo autorizacion-acceso → envios/ciudades);
// queda pendiente de prueba real cuando Dario obtenga las credenciales.

const AEX_API = String(process.env.MOBOS_AEX_API_URL || 'https://aex.com.py/api/v1').replace(/\/$/, '')
const PUBLIC_KEY = String(process.env.MOBOS_AEX_PUBLIC_KEY || '')
const PRIVATE_KEY = String(process.env.MOBOS_AEX_PRIVATE_KEY || '')
const TOKEN_TTL_MS = 9 * 60 * 1000 // el token dura 10 minutos; se renueva antes

let cachedToken: { token: string; until: number } | null = null

async function post(path: string, body: Record<string, unknown>, timeoutMs = 8000) {
  const response = await fetch(`${AEX_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return response.json() as Promise<Record<string, unknown>>
}

async function autorizar(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.token
  const primero = await post('/autorizacion-acceso/generar', { clave_publica: PUBLIC_KEY })
  const datos = (primero?.datos && typeof primero.datos === 'object' ? primero.datos : primero) as Record<string, unknown>
  const sesion = typeof datos?.codigo_sesion === 'string' ? datos.codigo_sesion : ''
  if (!sesion) throw new Error('AEX no devolvió el código de sesión.')
  const codigoAutorizacion = createHash('md5').update(`${PRIVATE_KEY}${sesion}`).digest('hex')
  const segundo = await post('/autorizacion-acceso/generar', { clave_publica: PUBLIC_KEY, codigo_autorizacion: codigoAutorizacion, codigo_sesion: sesion })
  const segundoDatos = (segundo?.datos && typeof segundo.datos === 'object' ? segundo.datos : segundo) as Record<string, unknown>
  const token = typeof segundoDatos?.codigo_autorizacion === 'string' ? segundoDatos.codigo_autorizacion : ''
  if (!token) throw new Error('AEX no devolvió el código de autorización.')
  cachedToken = { token, until: Date.now() + TOKEN_TTL_MS }
  return token
}

export type AexCity = { city: string; department: string }

const norm = (value: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
/** Devuelve null cuando no hay credenciales o el proveedor falla: el llamador
 *  cae al catálogo local. */
export async function aexCities(query: string, limit = 10): Promise<AexCity[] | null> {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/ciudades', { clave_publica: PUBLIC_KEY, codigo_autorizacion: token })
    const rows = Array.isArray(respuesta?.datos) ? respuesta.datos : []
    const q = norm(query)
    if (q.length < 2) return []
    return rows
      .filter((row: any) => norm(String(row?.denominacion || '')).includes(q) || norm(String(row?.departamento_denominacion || '')).includes(q))
      .slice(0, limit)
      .map((row: any) => ({ city: String(row?.denominacion || '').trim(), department: String(row?.departamento_denominacion || '').trim() }))
  } catch {
    return null
  }
}

export type AexTrackingEvent = { fecha: string; estado: string; tipoEvento: string; observacion: string }

// Seguimiento de una guía. Sin credenciales devuelve null: el llamador muestra
// el enlace web de seguimiento. Los eventos vienen ordenados por fecha.
export async function aexTracking(guia: string): Promise<AexTrackingEvent[] | null> {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return null
  const numero = (guia || '').trim()
  if (!numero) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/tracking', { clave_publica: PUBLIC_KEY, codigo_autorizacion: token, numero_guia: numero })
    const rows = Array.isArray(respuesta?.datos) ? respuesta.datos : []
    return rows.map((evento: any) => ({
      fecha: String(evento?.fecha || ''),
      estado: String(evento?.estado || ''),
      tipoEvento: String(evento?.tipo_evento || ''),
      observacion: String(evento?.observacion || ''),
    }))
  } catch {
    return null
  }
}

export function aexWebTrackingUrl(guia: string) {
  return `https://www.aex.com.py/seguimiento?guia=${encodeURIComponent((guia || '').trim())}`
}
