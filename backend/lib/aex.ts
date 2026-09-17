import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

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

async function post(path: string, body: Record<string, unknown>, timeoutMs = 12000) {
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

// ── Envíos completos (cotizar → solicitar → confirmar → guía) ──────────────
// Preparado según la doc v1.5.4; se activa solo con credenciales. Sin ellas
// (o ante falla) devuelve null y la interfaz cae al flujo web/manual.

type AexCiudadRow = { codigo: string; denominacion: string }

async function ciudadesConCobertura(): Promise<AexCiudadRow[] | null> {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/ciudades', { clave_publica: PUBLIC_KEY, codigo_autorizacion: token })
    const rows = Array.isArray(respuesta?.datos) ? respuesta.datos : []
    return rows.map((row: any) => ({ codigo: String(row?.codigo_ciudad || ''), denominacion: String(row?.denominacion || '').trim() })).filter((row) => row.codigo && row.denominacion)
  } catch { return null }
}

function codigoDeCiudad(ciudades: AexCiudadRow[], ciudad: string) {
  const normalizado = norm(ciudad)
  const exacta = ciudades.find((row) => norm(row.denominacion) === normalizado)
  if (exacta) return exacta.codigo
  const parcial = ciudades.find((row) => norm(row.denominacion).includes(normalizado) || normalizado.includes(norm(row.denominacion)))
  return parcial?.codigo || ''
}

export type AexShipmentQuote = { serviceId: number; serviceName: string; costPyg: number; deliveryHours: number | null }

// Cotiza el envío de un paquete entre dos ciudades (por nombre de ciudad).
export async function aexQuote(origen: string, destino: string, pesoKg: number): Promise<AexShipmentQuote[] | null> {
  const ciudades = await ciudadesConCobertura()
  if (!ciudades) return null
  const codigoOrigen = codigoDeCiudad(ciudades, origen)
  const codigoDestino = codigoDeCiudad(ciudades, destino)
  if (!codigoOrigen || !codigoDestino) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/calcular', {
      clave_publica: PUBLIC_KEY,
      codigo_autorizacion: token,
      origen: codigoOrigen,
      destino: codigoDestino,
      codigo_tipo_carga: 'P',
      paquetes: [{ descripcion: 'Mercadería', peso: pesoKg, largo: 30, alto: 20, ancho: 20, cantidad: 1, valor: 0 }],
    })
    const rows = Array.isArray(respuesta?.datos) ? respuesta.datos : []
    return rows.map((row: any) => ({ serviceId: Number(row?.id_tipo_servicio || 0), serviceName: String(row?.tipo_servicio || 'Servicio'), costPyg: Number(row?.costo_flete || 0), deliveryHours: Number(row?.tiempo_entrega) > 0 ? Number(row.tiempo_entrega) : null }))
  } catch { return null }
}

export type AexShipResult = { guide: string; costPyg: number; serviceName: string }

// Confirma el servicio más barato y devuelve la guía. `codigoOperacion` permite
// rastrear el traslado en el tracking de AEX.
export async function aexShip(origen: string, destino: string, pesoKg: number, codigoOperacion: string, direccionOrigen: string, direccionDestino: string): Promise<AexShipResult | null> {
  const cotizaciones = await aexQuote(origen, destino, pesoKg)
  if (!cotizaciones || !cotizaciones.length) return null
  const elegida = cotizaciones.sort((a, b) => a.costPyg - b.costPyg)[0]
  const ciudades = await ciudadesConCobertura()
  if (!ciudades) return null
  const codigoOrigen = codigoDeCiudad(ciudades, origen)
  const codigoDestino = codigoDeCiudad(ciudades, destino)
  if (!codigoOrigen || !codigoDestino) return null
  try {
    const token = await autorizar()
    const solicitud = await post('/envios/solicitar_servicio', {
      clave_publica: PUBLIC_KEY, codigo_autorizacion: token,
      origen: codigoOrigen, destino: codigoDestino, codigo_operacion: codigoOperacion,
      codigo_tipo_carga: 'P',
      paquetes: [{ descripcion: 'Mercadería', peso: pesoKg, largo: 30, alto: 20, ancho: 20, cantidad: 1, valor: 0 }],
    })
    const datos = (solicitud?.datos && typeof solicitud.datos === 'object' ? solicitud.datos : solicitud) as Record<string, unknown>
    const idSolicitud = Number(datos?.id_solicitud || 0)
    if (!idSolicitud) return null
    const confirmacion = await post('/envios/confirmar_servicio', {
      clave_publica: PUBLIC_KEY, codigo_autorizacion: token,
      id_solicitud: idSolicitud, id_tipo_servicio: elegida.serviceId,
      pickup: { direccion: direccionOrigen || 'AEX Casa Matriz', ciudad: codigoOrigen, referencias: origen },
      entrega: { direccion: direccionDestino || 'Sucursal destino', ciudad: codigoDestino, referencias: destino },
    })
    const confirmado = (confirmacion?.datos && typeof confirmacion.datos === 'object' ? confirmacion.datos : confirmacion) as Record<string, unknown>
    const guia = String(confirmado?.numero_guia || confirmado?.guia || '').trim()
    if (!guia) return null
    return { guide: guia, costPyg: elegida.costPyg, serviceName: elegida.serviceName }
  } catch { return null }
}

export type AexWebhookEvento = {
  guia: string
  codigoEstado: string
  estado: string
  codigoTipoEvento: string
  tipoEvento: string
  observacion: string
  codigoOperacion: string
  fechaEvento: string
}

const textoWebhook = (valor: unknown, max: number) => String(valor ?? '').trim().slice(0, max)

// Normaliza el payload que AEX envía por webhook. Devuelve null si no trae guía:
// el receptor responde 400 y AEX reintenta.
export function normalizarEventoWebhook(payload: unknown): AexWebhookEvento | null {
  if (!payload || typeof payload !== 'object') return null
  const datos = payload as Record<string, unknown>
  const guia = textoWebhook(datos.guia, 100)
  if (!guia) return null
  return {
    guia,
    codigoEstado: textoWebhook(datos.codigo_estado, 20),
    estado: textoWebhook(datos.estado, 200),
    codigoTipoEvento: textoWebhook(datos.codigo_tipo_evento, 20),
    tipoEvento: textoWebhook(datos.tipo_evento, 200),
    observacion: textoWebhook(datos.observacion, 500),
    codigoOperacion: textoWebhook(datos.codigo_operacion_cliente, 120),
    fechaEvento: textoWebhook(datos.fecha, 30),
  }
}

// Token del webhook: se acuerda con AEX y viaja en el header configurado
// (por defecto Authorization: Bearer <token>). Sin token configurado se acepta,
// para poder probar en el sandbox.
export function webhookAutorizado(request: Request) {
  const esperado = String(process.env.MOBOS_AEX_WEBHOOK_TOKEN || '').trim()
  if (!esperado) return true
  const header = String(process.env.MOBOS_AEX_WEBHOOK_HEADER || 'authorization').toLowerCase()
  const recibido = String(request.headers.get(header) || '').replace(/^Bearer\s+/i, '').trim()
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Fecha del evento en formato `YYYY-MM-DD HH:MM:SS` (hora local de AEX).
export function fechaEventoAex(valor: string): Date | null {
  const limpio = (valor || '').trim().replace(' ', 'T')
  if (!limpio) return null
  const fecha = new Date(limpio)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}
