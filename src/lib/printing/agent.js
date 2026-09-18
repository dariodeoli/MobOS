// Cliente del agente local de impresión (print-agent). La app le manda los
// bytes ESC/POS ya armados; el agente decide LAN o USB y encola si falla.
// Sin agente, quien llama cae al respaldo de siempre (printHtml).
//
// Las impresoras configuradas viven en localStorage por tenant (regla de
// aislamiento entre empresas). El token del agente nunca se muestra completo
// en pantalla ni se registra en logs: acá solo se guarda y se enmascara.

import { printHtml } from '@/utils/printHtml'

const CLAVE_CONFIG = 'mobos:impresora:config'
const CLAVE_BASE = 'mobos:impresoras:v1'
export const URL_AGENTE = 'http://127.0.0.1:17890'

const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const enmascararToken = (token = '') => {
  const valor = String(token || '')
  if (valor.length <= 8) return valor ? '••••••••' : ''
  return `${valor.slice(0, 4)}…${valor.slice(-4)}`
}

const leer = (clave) => {
  try { return JSON.parse(localStorage.getItem(clave) || 'null') } catch { return null }
}
const escribir = (clave, valor) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento */ }
}

// Clave por tenant: cada empresa ve y configura solo sus impresoras.
const claveTenant = (tenantId) => `${CLAVE_BASE}:${tenantId || 'sin-tenant'}`

const baseImpresora = () => ({
  id: uuid(),
  nombre: '',
  marca: '',
  modelo: '',
  ubicacion: '',
  conexion: 'lan',
  destino: '',
  ancho: 80,
  copias: 1,
  corte: true,
  densidad: 3,
  caracteres: true,
  predeterminada: false,
  activa: true,
  ultimaPrueba: null,
})

const vacio = () => ({ agentUrl: URL_AGENTE, agentToken: '', impresoras: [] })

// Migra la configuración vieja (una sola impresora global) a la nueva por tenant.
const migrarVieja = () => {
  const vieja = leer(CLAVE_CONFIG)
  if (!vieja) return null
  const impresora = {
    ...baseImpresora(),
    nombre: vieja.impresora || 'Impresora térmica',
    destino: String(vieja.impresora || ''),
    conexion: String(vieja.impresora || '').startsWith('usb:') ? 'usb' : 'lan',
    ancho: Number(vieja.ancho) === 58 ? 58 : 80,
    copias: Number(vieja.copias) || 1,
    predeterminada: true,
  }
  return {
    agentUrl: String(vieja.url || URL_AGENTE),
    agentToken: String(vieja.token || ''),
    impresoras: impresora.destino ? [impresora] : [],
  }
}

export function cargarImpresoras(tenantId) {
  const actual = leer(claveTenant(tenantId))
  if (actual && Array.isArray(actual.impresoras)) return actual
  const migrada = migrarVieja()
  if (migrada) { escribir(claveTenant(tenantId), migrada); return migrada }
  return vacio()
}

export function guardarImpresoras(tenantId, cambios) {
  const siguiente = { ...cargarImpresoras(tenantId), ...cambios }
  escribir(claveTenant(tenantId), siguiente)
  return siguiente
}

export const imprimirConDestino = (store) => {
  const activas = store.impresoras.filter((item) => item.activa)
  const predeterminada = activas.find((item) => item.predeterminada) || activas[0] || null
  return { predeterminada, activas }
}

// ── Compatibilidad con el flujo viejo ──────────────────────────────────────
// Otros componentes leen configImpresora(): devuelve la impresora
// predeterminada del tenant (o vacío) con la URL y el token del agente.
let tenantActivo = null
export function usarTenantImpresoras(tenantId) { tenantActivo = tenantId || null }

export const configImpresora = () => {
  const base = { url: URL_AGENTE, impresora: '', ancho: 80, copias: 1, token: '' }
  try {
    const store = cargarImpresoras(tenantActivo)
    const { predeterminada } = imprimirConDestino(store)
    const guardado = {
      url: store.agentUrl || URL_AGENTE,
      token: store.agentToken || '',
      impresora: predeterminada?.destino || '',
      ancho: predeterminada?.ancho || 80,
      copias: predeterminada?.copias || 1,
    }
    return { ...base, ...guardado }
  } catch {
    return base
  }
}

export const guardarConfigImpresora = (cambios = {}) => {
  const store = cargarImpresoras(tenantActivo)
  const actual = configImpresora()
  const siguiente = { ...actual, ...cambios }
  if (cambios.url !== undefined || cambios.token !== undefined) {
    if (cambios.url !== undefined) store.agentUrl = String(cambios.url || URL_AGENTE)
    if (cambios.token !== undefined) store.agentToken = String(cambios.token || '')
  }
  const predeterminada = store.impresoras.find((item) => item.predeterminada && item.activa)
  if (predeterminada) {
    if (cambios.impresora !== undefined) predeterminada.destino = String(cambios.impresora || '')
    if (cambios.ancho !== undefined) predeterminada.ancho = Number(cambios.ancho) === 58 ? 58 : 80
    if (cambios.copias !== undefined) predeterminada.copias = Math.min(5, Math.max(1, Number(cambios.copias) || 1))
  }
  guardarImpresoras(tenantActivo, store)
  return siguiente
}

let cache = { hasta: 0, estado: null }

// Consulta el agente con timeout corto: si no está, la app sigue funcionando
// con el diálogo del navegador. Con token, el agente devuelve además las
// impresoras detectadas y el estado de la cola.
export async function estadoAgente({ forzar = false } = {}) {
  const { url, token } = configImpresora()
  if (!forzar && cache.estado && Date.now() < cache.hasta) return cache.estado
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 1200)
  try {
    const respuesta = await fetch(`${url}/health`, { signal: control.signal, headers: token ? { 'x-mobos-print-token': token } : {} })
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    const datos = await respuesta.json()
    cache = { hasta: Date.now() + 5000, estado: { disponible: true, ...datos } }
    return cache.estado
  } catch {
    cache = { hasta: Date.now() + 5000, estado: { disponible: false } }
    return cache.estado
  } finally {
    clearTimeout(timer)
  }
}

const consultarAgente = async (camino, { method = 'GET', body } = {}) => {
  const { url, token } = configImpresora()
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 5000)
  try {
    const respuesta = await fetch(`${url}${camino}`, {
      method,
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-mobos-print-token': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || datos?.ok === false) throw new Error(datos?.error || `El agente respondió ${respuesta.status}.`)
    return datos
  } finally {
    clearTimeout(timer)
  }
}

export const diagnosticoAgente = (destino) => consultarAgente(`/diagnostico${destino ? `?destino=${encodeURIComponent(destino)}` : ''}`)
export const colaAgente = () => consultarAgente('/jobs')
export const historialAgente = (limite = 30) => consultarAgente(`/historial?limite=${limite}`)
export const reintentarFallidos = () => consultarAgente('/jobs/retry', { method: 'POST' })
export const limpiarFallidos = (ids = []) => consultarAgente('/jobs/clear', { method: 'POST', body: { ids } })
export const repararRed = () => consultarAgente('/red/agregar', { method: 'POST' })

// Sincroniza el agente puente con la lista de impresoras: cuál es la
// predeterminada y qué destinos LAN tiene permitidos.
export async function sincronizarAgente(store) {
  const { predeterminada, activas } = imprimirConDestino(store)
  return consultarAgente('/config', {
    method: 'POST',
    body: {
      impresora: predeterminada?.destino || '',
      ancho: predeterminada?.ancho || 80,
      copias: predeterminada?.copias || 1,
      lan: activas.filter((item) => item.conexion === 'lan' && item.destino).map((item) => item.destino),
    },
  })
}

// Manda un ticket (crearTicket().base64()) al agente. Devuelve `{ ok }` o el
// error para mostrarlo en pantalla.
export async function imprimirDirecto(base64, { ancho, copias, impresora, usuario, ref, tipo } = {}) {
  const config = configImpresora()
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 5000)
  try {
    const respuesta = await fetch(`${config.url}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.token ? { 'x-mobos-print-token': config.token } : {}) },
      body: JSON.stringify({
        impresora: impresora ?? config.impresora ?? '',
        ancho: ancho ?? config.ancho,
        copias: copias ?? config.copias,
        usuario: String(usuario || '').slice(0, 80),
        ref: String(ref || '').slice(0, 64),
        tipo: String(tipo || '').slice(0, 40),
        data: base64,
      }),
      signal: control.signal,
    })
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || datos?.ok === false) throw new Error(datos?.error || `El agente respondió ${respuesta.status}.`)
    return { ok: true, encolado: Boolean(datos?.encolado), incierto: Boolean(datos?.incierto), estado: datos?.estado || '', transporte: datos?.transporte || '', error: datos?.error || '', jobId: datos?.jobId || null }
  } catch (cause) {
    const mensaje = cause?.name === 'AbortError' ? 'El agente de impresión no respondió.' : cause?.message || 'No se pudo imprimir.'
    return { ok: false, error: mensaje }
  } finally {
    clearTimeout(timer)
  }
}

export async function imprimirTicketDirecto(ticket, opciones = {}) {
  return imprimirDirecto(ticket.base64(), opciones)
}

// Camino preferido: si el agente está disponible, imprime directo; si no (o si
// falla), cae al HTML de siempre con el diálogo del navegador.
// Envía por el agente si está disponible. NUNCA abre el diálogo por su
// cuenta: tras un envío fallido o incierto eso podría duplicar el ticket.
// Devuelve el estado real para que quien llama decida (el diálogo es una
// acción manual separada con imprimirConDialogo).
export async function imprimirTicketOFallback(ticket) {
  const estado = await estadoAgente()
  if (!estado.disponible) {
    return { ok: false, directo: false, motivo: 'agente-no-disponible', error: 'El agente de impresión no está disponible.' }
  }
  const resultado = await imprimirTicketDirecto(ticket)
  if (resultado.ok && !resultado.encolado) return { ...resultado, directo: true, ok: true }
  if (resultado.encolado) {
    return { ok: false, directo: false, motivo: resultado.incierto ? 'incierto' : 'en-cola', error: resultado.error || '', jobId: resultado.jobId || null }
  }
  return { ok: false, directo: false, motivo: 'fallo', error: resultado.error || '', incierto: Boolean(resultado.incierto) }
}

// Diálogo de impresión del navegador: acción MANUAL y explícita (no permite
// impresión silenciosa). Devuelve false si no había HTML para mostrar.
export function imprimirConDialogo(html) {
  if (typeof html !== 'string' || !html.trim()) return false
  printHtml(html)
  return true
}
