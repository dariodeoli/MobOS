// Cliente del agente local de impresión (print-agent). La app le manda los
// bytes ESC/POS ya armados; el agente decide LAN o USB y encola si falla.
// Sin agente, quien llama cae al respaldo de siempre (printHtml).

import { printHtml } from '@/utils/printHtml'

const CLAVE_CONFIG = 'mobos:impresora:config'
export const URL_AGENTE = 'http://127.0.0.1:17890'

export const configImpresora = () => {
  try {
    return { url: URL_AGENTE, impresora: '', ancho: 80, copias: 1, token: '', ...(JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}') || {}) }
  } catch {
    return { url: URL_AGENTE, impresora: '', ancho: 80, copias: 1, token: '' }
  }
}

export const guardarConfigImpresora = (cambios = {}) => {
  const siguiente = { ...configImpresora(), ...cambios }
  try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(siguiente)) } catch { /* sin almacenamiento */ }
  return siguiente
}

let cache = { hasta: 0, estado: null }

// Consulta el agente con timeout corto: si no está, la app sigue funcionando
// con el diálogo del navegador.
export async function estadoAgente({ forzar = false } = {}) {
  const { url } = configImpresora()
  if (!forzar && cache.estado && Date.now() < cache.hasta) return cache.estado
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 1200)
  try {
    const respuesta = await fetch(`${url}/health`, { signal: control.signal, targetAddressSpace: 'local' })
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

// Manda un ticket (crearTicket().base64()) al agente. Devuelve `{ ok }` o el
// error para mostrarlo en pantalla.
export async function imprimirDirecto(base64, { ancho, copias, impresora } = {}) {
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
        data: base64,
      }),
      signal: control.signal,
      targetAddressSpace: 'local',
    })
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || datos?.ok === false) throw new Error(datos?.error || `El agente respondió ${respuesta.status}.`)
    return { ok: true, encolado: Boolean(datos?.encolado), jobId: datos?.jobId || null }
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
export async function imprimirTicketOFallback(ticket, html) {
  const estado = await estadoAgente()
  if (estado.disponible) {
    const resultado = await imprimirTicketDirecto(ticket)
    if (resultado.ok) return { ...resultado, directo: true }
  }
  return { ok: true, directo: false, html: typeof html === 'string' ? printHtml(html) : undefined }
}
