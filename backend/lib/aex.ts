import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

// Adaptador opcional de AEX (envíos) para el catálogo de ciudades. Se activa
// solo cuando existen las credenciales de entorno; sin ellas el autocompletado
// usa el catálogo GeoCity sembrado en la base. Preparado según la
// documentación de la API v1.5.4 (flujo autorizacion-acceso → envios/ciudades);
// queda pendiente de prueba real cuando Dario obtenga las credenciales.

const aexApi = () => String(process.env.MOBOS_AEX_API_URL || 'https://aex.com.py/api/v1').replace(/\/$/, '')
// Las credenciales se leen en cada llamada (no al cargar el módulo) para que
// las pruebas puedan alternar entre sandbox y configuración ausente.
const publicKey = () => String(process.env.MOBOS_AEX_PUBLIC_KEY || '')
const privateKey = () => String(process.env.MOBOS_AEX_PRIVATE_KEY || '')
const TOKEN_TTL_MS = 9 * 60 * 1000 // el token dura 10 minutos; se renueva antes

let cachedToken: { token: string; until: number } | null = null

// Transporte HTTP del adaptador. En producción es `fetch`; los tests pueden
// inyectar uno propio (sin tocar `globalThis.fetch`, que otros tests reemplazan).
type AexTransporte = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>
let transporte: AexTransporte = (url, init) => fetch(url, init)

/** Solo para tests: inyecta el transporte HTTP (null restaura el global). */
export function aexTransporteDePrueba(fn: AexTransporte | null) {
  transporte = fn || ((url, init) => fetch(url, init))
}

async function post(path: string, body: Record<string, unknown>, timeoutMs = 12000) {
  const response = await transporte(`${aexApi()}${path}`, {
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
    clave_publica: publicKey(),
    codigo_sesion: codigoSesion,
    clave_privada: createHash('md5').update(`${privateKey()}${codigoSesion}`).digest('hex'),
  })
  const token = typeof respuesta?.codigo_autorizacion === 'string' ? respuesta.codigo_autorizacion : ''
  if (!token) throw new Error(String(respuesta?.mensaje || 'AEX no devolvió el código de autorización.'))
  cachedToken = { token, until: Date.now() + TOKEN_TTL_MS }
  return token
}

const norm = (value: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export type AexTrackingEvent = { fecha: string; estado: string; tipoEvento: string; observacion: string }

export type AexTrackingResultado =
  | { ok: true; eventos: AexTrackingEvent[]; codigo: string; mensaje: string }
  | { ok: false; etapa: string; codigo: string; mensaje: string }

// Seguimiento por número de guía o por `codigo_operacion` (doc v1.5.4: es
// obligatorio uno de los dos; si van ambos, manda el número de guía). Devuelve
// la etapa y el código/mensaje de AEX para poder diagnosticar sin adivinar.
export async function aexTrackingDetallado(input: { guia?: string; codigoOperacion?: string } = {}): Promise<AexTrackingResultado> {
  const numero = String(input.guia || '').trim()
  const operacion = String(input.codigoOperacion || '').trim()
  if (!numero && !operacion) return { ok: false, etapa: 'consulta', codigo: 'parametros', mensaje: 'Indicá numero_guia o codigo_operacion.' }
  if (!publicKey() || !privateKey()) return { ok: false, etapa: 'configuracion', codigo: 'sin-claves', mensaje: 'Faltan MOBOS_AEX_PUBLIC_KEY / MOBOS_AEX_PRIVATE_KEY.' }
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/tracking', {
      clave_publica: publicKey(), codigo_autorizacion: token,
      ...(numero ? { numero_guia: numero } : { codigo_operacion: operacion }),
    })
    const errorTracking = fallaDe(respuesta)
    if (errorTracking) return { ok: false, etapa: 'consulta', codigo: errorTracking.codigo, mensaje: errorTracking.mensaje }
    const rows = filasDe(respuesta).filter((fila) => fila && (fila.fecha || fila.estado || fila.codigo_estado))
    return {
      ok: true,
      codigo: '0',
      mensaje: '',
      eventos: rows.map((evento: any) => ({
        fecha: String(evento?.fecha || ''),
        estado: String(evento?.estado || ''),
        tipoEvento: String(evento?.tipo_evento || ''),
        observacion: String(evento?.observacion || ''),
      })),
    }
  } catch (causa) {
    return { ok: false, etapa: 'consulta', codigo: 'red', mensaje: causa instanceof Error ? causa.message : 'Error de red consultando el tracking.' }
  }
}

// Seguimiento de una guía. Sin credenciales devuelve null: el llamador muestra
// el enlace web de seguimiento. Los eventos vienen ordenados por fecha.
export async function aexTracking(guia: string): Promise<AexTrackingEvent[] | null> {
  const resultado = await aexTrackingDetallado({ guia })
  return resultado.ok ? resultado.eventos : null
}

export function aexWebTrackingUrl(guia: string) {
  return `https://www.aex.com.py/seguimiento?guia=${encodeURIComponent((guia || '').trim())}`
}

// ── Envíos completos (cotizar → solicitar → confirmar → guía) ──────────────
// Preparado según la doc v1.5.4; se activa solo con credenciales. Sin ellas
// (o ante falla) devuelve null y la interfaz cae al flujo web/manual.

type AexCiudadRow = { codigo: string; denominacion: string }

async function ciudadesConCobertura(): Promise<AexCiudadRow[] | null> {
  if (!publicKey() || !privateKey()) return null
  try {
    const token = await autorizar()
    const respuesta = await post('/envios/ciudades', { clave_publica: publicKey(), codigo_autorizacion: token })
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
      clave_publica: publicKey(),
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
export type AexFalla = { etapa: string; codigo: string; mensaje: string }

let ultimaFalla: AexFalla | null = null

/** Última falla del flujo de envíos: etapa + código/mensaje textual de AEX. */
export function aexUltimaFalla() {
  return ultimaFalla
}

// La doc v1.5.4 indica JSON Array en los endpoints de envíos: la respuesta puede
// ser un arreglo, un objeto o venir dentro de `datos`. Se normaliza a filas.
function filasDe(respuesta: unknown): Record<string, any>[] {
  const raiz = (respuesta || {}) as Record<string, any>
  const datos = raiz.datos !== undefined ? raiz.datos : raiz
  if (Array.isArray(datos)) return datos as Record<string, any>[]
  if (datos && typeof datos === 'object') return [datos as Record<string, any>]
  return []
}

// Código/mensaje de AEX cuando la operación no fue exitosa (0 = sin error).
function fallaDe(respuesta: unknown): { codigo: string; mensaje: string } | null {
  const fila = filasDe(respuesta)[0] || {}
  const codigo = String(fila.codigo ?? '').trim()
  if (!codigo || codigo === '0') return null
  return { codigo, mensaje: String(fila.mensaje || 'Operación rechazada por AEX.') }
}

export type AexParte = { codigo?: string; tipoDocumento?: string; numeroDocumento: string; nombre: string; apellido?: string; email: string; telefono: number; personeria?: string }
export type AexDireccion = { codigo: string; callePrincipal: string; numeroCasa?: number; calleTransversal1: string; calleTransversal2?: string; codigoCiudad?: string; telefono?: number; referencias?: string }

// Campos de remitente/destinatario según la doc: documento, nombre, email y al
// menos un teléfono. `personeria` distingue persona física (F) o jurídica (J).
function parteAex(parte: AexParte) {
  return {
    ...(parte.codigo ? { codigo: parte.codigo } : {}),
    tipo_documento: parte.tipoDocumento || 'CI',
    numero_documento: parte.numeroDocumento,
    nombre: parte.nombre,
    ...(parte.apellido ? { apellido: parte.apellido } : {}),
    email: parte.email,
    personeria: parte.personeria || 'F',
    telefonos: [{ numero: Number(parte.telefono) || 0, denominacion: 'Principal' }],
  }
}

// Campos de recogida/entrega según la doc: calle principal y transversal son
// obligatorias, la ciudad va por código (el de `origen`/`destino`).
function direccionAex(direccion: AexDireccion) {
  return {
    codigo: direccion.codigo,
    calle_principal: direccion.callePrincipal,
    ...(direccion.numeroCasa ? { numero_casa: Number(direccion.numeroCasa) } : {}),
    calle_transversal_1: direccion.calleTransversal1,
    ...(direccion.calleTransversal2 ? { calle_transversal_2: direccion.calleTransversal2 } : {}),
    codigo_ciudad: direccion.codigoCiudad || '',
    ...(direccion.telefono ? { telefono: Number(direccion.telefono) } : {}),
    ...(direccion.referencias ? { referencias: direccion.referencias } : {}),
  }
}

export type AexEnvioResultado =
  | { ok: true; etapa: 'confirmar_servicio'; guia: string; idSolicitud: number; costoPyg: number; servicio: string; codigo: string; mensaje: string }
  | { ok: false; etapa: string; codigo: string; mensaje: string }

// Flujo completo según la doc v1.5.4: solicitar_servicio devuelve un ARRAY de
// ofertas (id_solicitud + condiciones) y confirmar_servicio exige remitente,
// pickup, destinatario y entrega. Cada paso reporta su etapa y el código/mensaje
// de AEX, sin inventar guías.
export async function aexSolicitarYConfirmar(input: {
  origen: string
  destino: string
  pesoKg: number
  codigoOperacion: string
  remitente: AexParte
  destinatario: AexParte
  pickup: AexDireccion
  entrega: AexDireccion
  descripcion?: string
}): Promise<AexEnvioResultado> {
  const fallar = (etapa: string, codigo: string, mensaje: string): AexEnvioResultado => {
    ultimaFalla = { etapa, codigo, mensaje }
    return { ok: false, etapa, codigo, mensaje }
  }
  ultimaFalla = null
  if (!publicKey() || !privateKey()) return fallar('configuracion', 'sin-claves', 'Faltan MOBOS_AEX_PUBLIC_KEY / MOBOS_AEX_PRIVATE_KEY.')
  let token = ''
  try {
    token = await autorizar()
  } catch (causa) {
    return fallar('autorizacion', 'auth', causa instanceof Error ? causa.message : 'No se pudo autorizar contra AEX.')
  }
  const ciudades = await ciudadesConCobertura()
  if (!ciudades) return fallar('ciudades', 'ciudades', 'AEX no devolvió ciudades de cobertura.')
  const codigoOrigen = codigoDeCiudad(ciudades, input.origen)
  const codigoDestino = codigoDeCiudad(ciudades, input.destino)
  if (!codigoOrigen || !codigoDestino) return fallar('ciudades', 'ciudad', `No se encontró "${!codigoOrigen ? input.origen : input.destino}" en las ciudades de AEX.`)

  let idSolicitud = 0
  let condiciones: { id: number; nombre: string; costo: number; horas: number | null }[] = []
  try {
    const respuesta = await post('/envios/solicitar_servicio', {
      clave_publica: publicKey(), codigo_autorizacion: token,
      origen: codigoOrigen, destino: codigoDestino, codigo_operacion: input.codigoOperacion,
      codigo_tipo_carga: 'P',
      paquetes: [{ descripcion: input.descripcion || 'Mercadería', peso: input.pesoKg, largo: 30, alto: 20, ancho: 20, cantidad: 1, valor: 0 }],
    })
    const error = fallaDe(respuesta)
    if (error) return fallar('solicitar_servicio', error.codigo, error.mensaje)
    const fila = filasDe(respuesta)[0] || {}
    idSolicitud = Number(fila.id_solicitud || fila.id || 0)
    if (!idSolicitud) return fallar('solicitar_servicio', 'sin-id', 'AEX no devolvió id_solicitud para la oferta.')
    condiciones = (Array.isArray(fila.condiciones) ? fila.condiciones : [])
      .map((condicion: any) => ({
        id: Number(condicion?.id_tipo_servicio || 0),
        nombre: String(condicion?.tipo_servicio || 'Servicio'),
        costo: Number(condicion?.costo_flete || 0),
        horas: Number(condicion?.tiempo_entrega) > 0 ? Number(condicion.tiempo_entrega) : null,
      }))
      .filter((condicion: { id: number }) => condicion.id)
      .sort((a: { costo: number }, b: { costo: number }) => a.costo - b.costo)
  } catch (causa) {
    return fallar('solicitar_servicio', 'red', causa instanceof Error ? causa.message : 'Error de red solicitando el servicio.')
  }
  const elegida = condiciones[0]
  const idServicio = elegida?.id || Number(process.env.MOBOS_AEX_SERVICE_ID || 0)
  if (!idServicio) return fallar('solicitar_servicio', 'sin-servicio', 'La oferta de AEX no incluyó condiciones de servicio.')

  try {
    const respuesta = await post('/envios/confirmar_servicio', {
      clave_publica: publicKey(), codigo_autorizacion: token,
      id_solicitud: idSolicitud, id_tipo_servicio: idServicio,
      remitente: parteAex(input.remitente),
      pickup: direccionAex({ ...input.pickup, codigoCiudad: codigoOrigen }),
      destinatario: parteAex(input.destinatario),
      entrega: direccionAex({ ...input.entrega, codigoCiudad: codigoDestino }),
    })
    const error = fallaDe(respuesta)
    if (error) return fallar('confirmar_servicio', error.codigo, error.mensaje)
    const filas = filasDe(respuesta)
    const conGuia = (item: any) => [item?.numero_guia, item?.guia, item?.nro_guia, item?.numeroGuia, item?.datos?.numero_guia].map(valor => String(valor || '').trim()).find(Boolean) || ''
    const fila = filas.find((item) => conGuia(item)) || filas[0] || {}
    const guia = conGuia(fila)
    // #231: sin guía interpretable la respuesta es ambigua (pudo crearse): se
    // concilia por referencia; jamás se reintenta a ciegas.
    if (!guia) return fallar('confirmar_servicio', 'ambiguo', 'AEX respondió sin número de guía interpretable: conciliar por codigo_operacion (solo lectura), no reintentar.')
    return { ok: true, etapa: 'confirmar_servicio', guia, idSolicitud, costoPyg: elegida?.costo || 0, servicio: elegida?.nombre || 'Servicio', codigo: String(fila.codigo || '0'), mensaje: String(fila.mensaje || '') }
  } catch (causa) {
    return fallar('confirmar_servicio', 'red', causa instanceof Error ? causa.message : 'Error de red confirmando el servicio.')
  }
}

// Compatibilidad: confirma el servicio más barato y devuelve la guía (o null).
// `codigoOperacion` permite rastrear el traslado por tracking.
export async function aexShip(origen: string, destino: string, pesoKg: number, codigoOperacion: string, direccionOrigen: string, direccionDestino: string): Promise<AexShipResult | null> {
  const resultado = await aexSolicitarYConfirmar({
    origen, destino, pesoKg, codigoOperacion,
    remitente: { tipoDocumento: 'RUC', numeroDocumento: '80012345-0', nombre: 'Comercio demo', email: 'comercio@demo.mobos', telefono: 21000000 },
    destinatario: { tipoDocumento: 'CI', numeroDocumento: '1234567', nombre: 'Cliente demo', email: 'cliente@demo.mobos', telefono: 981000000 },
    pickup: { codigo: 'DEMO-ORIGEN', callePrincipal: direccionOrigen || 'Av. Ficticia 1234', calleTransversal1: 'Calle Falsa', referencias: origen },
    entrega: { codigo: 'DEMO-DESTINO', callePrincipal: direccionDestino || 'Av. del Demo 789', calleTransversal1: 'Calle Ejemplo', referencias: destino },
  })
  return resultado.ok ? { guide: resultado.guia, costPyg: resultado.costoPyg, serviceName: resultado.servicio } : null
}

// ── Impresión de la guía/etiqueta ──────────────────────────────────────────
// La doc v1.5.4 expone POST /envios/imprimir y devuelve el PDF directo. Los
// códigos válidos son los de la lista de formatos; AEX usa "guia" por defecto.
export const AEX_LABEL_FORMATS = ['etiqueta65x45', 'etiqueta8x10', 'etiqueta8x6', 'guia', 'guia_A4', 'guia_A5', 'guia_A6'] as const
export type AexLabelFormat = (typeof AEX_LABEL_FORMATS)[number]

export function aexLabelFormatValido(valor: unknown): valor is AexLabelFormat {
  return typeof valor === 'string' && (AEX_LABEL_FORMATS as readonly string[]).includes(valor)
}

export type AexLabelResult = { ok: true; pdf: ArrayBuffer } | { ok: false; motivo: 'unconfigured' | 'unavailable' }

// Descarga la etiqueta o guía en PDF para el formato pedido. Sin credenciales
// devuelve `unconfigured` (la interfaz ofrece el enlace web) y ante una
// respuesta que no es PDF devuelve `unavailable`, sin inventar el archivo.
export async function aexLabel(guia: string, formato: AexLabelFormat, imprimirPartida = false): Promise<AexLabelResult> {
  if (!publicKey() || !privateKey()) return { ok: false, motivo: 'unconfigured' }
  const numero = (guia || '').trim()
  if (!numero) return { ok: false, motivo: 'unavailable' }
  try {
    const token = await autorizar()
    const response = await fetch(`${aexApi()}/envios/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave_publica: publicKey(),
        codigo_autorizacion: token,
        guia: numero,
        formato,
        imprimir_partida: imprimirPartida,
      }),
      signal: AbortSignal.timeout(30000),
    })
    const tipo = response.headers.get('content-type') || ''
    if (!response.ok || !tipo.includes('application/pdf')) return { ok: false, motivo: 'unavailable' }
    const pdf = await response.arrayBuffer()
    if (!pdf.byteLength) return { ok: false, motivo: 'unavailable' }
    return { ok: true, pdf }
  } catch { return { ok: false, motivo: 'unavailable' } }
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

// Credenciales del adaptador cargadas en el entorno.
export function aexConfigurado() {
  return Boolean(publicKey() && privateKey())
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

// Hay token de webhook acordado: sin él, el endpoint acepta cualquier origen.
export function aexWebhookConToken() {
  return Boolean(String(process.env.MOBOS_AEX_WEBHOOK_TOKEN || '').trim())
}

// Fecha del evento en formato `YYYY-MM-DD HH:MM:SS` (hora local de AEX).
export function fechaEventoAex(valor: string): Date | null {
  const limpio = (valor || '').trim().replace(' ', 'T')
  if (!limpio) return null
  const fecha = new Date(limpio)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}
