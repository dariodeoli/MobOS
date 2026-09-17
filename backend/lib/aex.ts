import { createHash, randomUUID } from 'node:crypto'

// Adaptador de AEX (envíos). Se activa solo cuando existen las credenciales de
// entorno; sin ellas el autocompletado usa el catálogo GeoCity sembrado en la
// base. Contrato verificado contra el sandbox de AEX según la documentación
// v1.5.4: autorizacion-acceso/generar (login de un paso), envios/ciudades,
// envios/solicitar_servicio (oferta con tipos de servicio) y envios/tracking.

const AEX_API = String(process.env.MOBOS_AEX_API_URL || 'https://aex.com.py/api/v1').replace(/\/$/, '')
const PUBLIC_KEY = String(process.env.MOBOS_AEX_PUBLIC_KEY || '')
const PRIVATE_KEY = String(process.env.MOBOS_AEX_PRIVATE_KEY || '')
const TOKEN_TTL_MS = 9 * 60 * 1000 // el token dura 10 minutos; se renueva antes

let cachedToken: { token: string; until: number } | null = null

async function post(path: string, body: Record<string, unknown>, timeoutMs = 12000) {
  const response = await fetch(`${AEX_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return response.json() as Promise<Record<string, unknown>>
}

export function aexConfigurado() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY)
}

// El login es de un solo paso: el cliente genera el código de sesión y envía
// md5(clave_privada + codigo_sesion). El token vuelve en la raíz de la respuesta.
async function autorizar(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.token
  const codigoSesion = randomUUID()
  const respuesta = await post('/autorizacion-acceso/generar', {
    clave_publica: PUBLIC_KEY,
    codigo_sesion: codigoSesion,
    clave_privada: createHash('md5').update(`${PRIVATE_KEY}${codigoSesion}`).digest('hex'),
  })
  const token = typeof respuesta?.codigo_autorizacion === 'string' ? respuesta.codigo_autorizacion : ''
  if (!token) throw new Error(String(respuesta?.mensaje || 'AEX no devolvió el código de autorización.'))
  cachedToken = { token, until: Date.now() + TOKEN_TTL_MS }
  return token
}

export type AexCity = { city: string; department: string; code: string }

const norm = (value: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
/** Devuelve null cuando no hay credenciales o el proveedor falla: el llamador
 *  cae al catálogo local. */
export async function aexCities(query: string, limit = 10): Promise<AexCity[] | null> {
  if (!aexConfigurado()) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/ciudades', { clave_publica: PUBLIC_KEY, codigo_autorizacion: token })
    const rows = Array.isArray(respuesta?.datos) ? respuesta.datos : []
    const q = norm(query)
    if (q.length < 2) return []
    return rows
      .filter((row: any) => norm(String(row?.denominacion || '')).includes(q) || norm(String(row?.departamento_denominacion || '')).includes(q))
      .slice(0, limit)
      .map((row: any) => ({
        city: String(row?.denominacion || '').trim(),
        department: String(row?.departamento_denominacion || '').trim(),
        code: String(row?.codigo_ciudad || '').trim(),
      }))
  } catch {
    return null
  }
}

export type AexTrackingEvent = { fecha: string; estado: string; tipoEvento: string; observacion: string }

// Seguimiento de una guía (o de un pedido propio por código de operación). Sin
// credenciales devuelve null: el llamador muestra el enlace web de seguimiento.
export async function aexTracking(guia: string, codigoOperacion?: string): Promise<AexTrackingEvent[] | null> {
  if (!aexConfigurado()) return null
  const numero = (guia || '').trim()
  const operacion = (codigoOperacion || '').trim()
  if (!numero && !operacion) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/tracking', {
      clave_publica: PUBLIC_KEY,
      codigo_autorizacion: token,
      ...(numero ? { numero_guia: numero } : { codigo_operacion: operacion }),
    })
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

export type AexPackage = {
  descripcion?: string
  codigo_externo?: string
  cantidad?: number
  peso: number
  largo: number
  alto: number
  ancho: number
  valor?: number
}

export type AexQuoteOption = {
  idTipoServicio: string
  tipoServicio: string
  descripcion: string
  incluyePickup: boolean
  incluyeEnvio: boolean
  costoFlete: number
  tiempoEntrega: string
  adicionales: { id: string; denominacion: string; costo: number; obligatorio: boolean }[]
}

export type AexQuote = { idSolicitud: string; condiciones: AexQuoteOption[] }

// Oferta de servicios para un envío (origen, destino y paquetes). Devuelve null
// si no hay credenciales o el proveedor falla.
export async function aexQuote(input: {
  origen: string
  destino: string
  paquetes: AexPackage[]
  codigoOperacion?: string
  importeCobro?: number
  tipoCarga?: 'P' | 'D'
}): Promise<AexQuote | null> {
  if (!aexConfigurado()) return null
  if (!input?.origen || !input?.destino || !Array.isArray(input?.paquetes) || input.paquetes.length === 0) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/solicitar_servicio', {
      clave_publica: PUBLIC_KEY,
      codigo_autorizacion: token,
      origen: input.origen,
      destino: input.destino,
      ...(input.codigoOperacion ? { codigo_operacion: input.codigoOperacion } : {}),
      ...(input.importeCobro ? { importe_cobro: input.importeCobro } : {}),
      ...(input.tipoCarga ? { codigo_tipo_carga: input.tipoCarga } : {}),
      paquetes: input.paquetes,
    })
    const datos = respuesta?.datos
    if (!datos || typeof datos !== 'object') return null
    const condiciones = Array.isArray((datos as any).condiciones) ? (datos as any).condiciones : []
    return {
      idSolicitud: String((datos as any).id_solicitud || ''),
      condiciones: condiciones.map((c: any) => ({
        idTipoServicio: String(c?.id_tipo_servicio || ''),
        tipoServicio: String(c?.tipo_servicio || ''),
        descripcion: String(c?.descripcion || ''),
        incluyePickup: String(c?.incluye_pickup || '') === 't',
        incluyeEnvio: String(c?.incluye_envio || '') === 't',
        costoFlete: Number(c?.costo_flete || 0),
        tiempoEntrega: String(c?.tiempo_entrega || ''),
        adicionales: (Array.isArray(c?.adicionales) ? c.adicionales : []).map((a: any) => ({
          id: String(a?.id_adicional || ''),
          denominacion: String(a?.denominacion || ''),
          costo: Number(a?.costo || 0),
          obligatorio: Boolean(a?.obligatorio),
        })),
      })),
    }
  } catch {
    return null
  }
}

export function aexWebTrackingUrl(guia: string) {
  return `https://www.aex.com.py/seguimiento?guia=${encodeURIComponent((guia || '').trim())}`
}
