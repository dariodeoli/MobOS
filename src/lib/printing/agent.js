// Cliente del agente local de impresión (print-agent). La app le manda los
// bytes ESC/POS ya armados; el agente decide LAN o USB y encola si falla.
// Sin agente, quien llama cae al respaldo de siempre (printHtml).
//
// Las impresoras configuradas viven en localStorage por tenant (regla de
// aislamiento entre empresas). El token del agente nunca se muestra completo
// en pantalla ni se registra en logs: acá solo se guarda y se enmascara.

import { printHtml } from '@/utils/printHtml'
import { printingApi } from '@/lib/api/printing'
import { normalizarDestino, normalizarPuentes, puenteDe, basePuente } from './puentes'
import { puedeCaerAlDialogo, resolverCamino, tokenDeAgente } from './ruteo'

export { puenteDe, resolverCamino, puedeCaerAlDialogo }
export { esLoopback } from './ruteo'

const CLAVE_CONFIG = 'mobos:impresora:config'
const CLAVE_BASE = 'mobos:impresoras:v1'
export const URL_AGENTE = 'http://127.0.0.1:17890'

// El backend es la autoridad de la configuración: la caché por tenant es un
// espejo de solo lectura (version 2) que se refresca desde la API y solo se
// escribe para importar la configuración legacy una única vez.
export const VERSION_STORE = 2

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
  // Puente que la sirve ('' = el de su sucursal o el predeterminado). Permite
  // varias computadoras puente con impresoras repartidas.
  bridgeId: '',
  // Sucursal de la impresora: los documentos de esa sucursal la prefieren.
  branchId: '',
  ultimaPrueba: null,
})

const vacio = () => ({ version: VERSION_STORE, syncedAt: null, importedAt: null, localBridgeId: '', remoteEnabled: true, agentUrl: URL_AGENTE, agentToken: '', bridges: [], impresoras: [], sucursales: [] })

// Normaliza una caché (v1 o v2) al shape version 2 sin inventar datos: el
// backend pisa lo suyo en el próximo refresco.
const normalizarCache = (store) => ({
  ...(store && typeof store === 'object' ? store : {}),
  version: VERSION_STORE,
  syncedAt: store?.syncedAt || null,
  importedAt: store?.importedAt || null,
  localBridgeId: String(store?.localBridgeId || ''),
  remoteEnabled: store?.remoteEnabled !== false,
  agentUrl: String(store?.agentUrl || URL_AGENTE),
  agentToken: String(store?.agentToken || ''),
  bridges: Array.isArray(store?.bridges) ? store.bridges : [],
  sucursales: Array.isArray(store?.sucursales) ? store.sucursales : [],
  impresoras: (Array.isArray(store?.impresoras) ? store.impresoras : []).map((impresora) => ({
    ...impresora,
    // Migración suave: `usb:<cola>` era una cola CUPS; pasa a `cups:<cola>`.
    destino: normalizarDestino(impresora.destino),
    conexion: impresora.conexion === 'usb' ? 'cups' : impresora.conexion,
  })),
})

// Migra la configuración vieja (una sola impresora global) a la nueva por tenant.
const migrarVieja = () => {
  const vieja = leer(CLAVE_CONFIG)
  if (!vieja) return null
  const impresora = {
    ...baseImpresora(),
    nombre: vieja.impresora || 'Impresora térmica',
    destino: normalizarDestino(vieja.impresora),
    conexion: String(vieja.impresora || '').startsWith('usb:') ? 'cups' : 'lan',
    ancho: Number(vieja.ancho) === 58 ? 58 : 80,
    copias: Number(vieja.copias) || 1,
    predeterminada: true,
  }
  return {
    version: VERSION_STORE,
    syncedAt: null,
    // Marcado como no importada: `importarConfigUnaVez` la sube al backend.
    importedAt: null,
    localBridgeId: '',
    remoteEnabled: true,
    agentUrl: String(vieja.url || URL_AGENTE),
    agentToken: String(vieja.token || ''),
    bridges: [{ ...basePuente(), url: String(vieja.url || URL_AGENTE), token: String(vieja.token || '') }],
    impresoras: impresora.destino ? [impresora] : [],
  }
}

export function cargarImpresoras(tenantId) {
  const actual = leer(claveTenant(tenantId))
  if (actual && Array.isArray(actual.impresoras)) {
    const normalizado = normalizarCache(actual)
    if (JSON.stringify(normalizado) !== JSON.stringify(actual)) escribir(claveTenant(tenantId), normalizado)
    return normalizado
  }
  const migrada = migrarVieja()
  if (migrada) { escribir(claveTenant(tenantId), migrada); return migrada }
  return vacio()
}

// ── Puentes e impresoras del backend (autoridad) ───────────────────────────
// El backend no expone URL ni token del puente: el agente abre la conexión
// saliente. El espejo sirve para listar, elegir y mostrar presencia.

export const esIdBackend = (id) => Boolean(id) && !String(id).startsWith('imp-') && !String(id).startsWith('puente-')

export const puenteDesdeBackend = (puente, predeterminado = false) => ({
  id: String(puente?.id || ''),
  nombre: String(puente?.name || 'Computadora puente'),
  // Sucursal que sirve este puente ('' = puente de empresa). El backend es la
  // autoridad: acá solo se espeja para elegir y mostrar.
  branchId: String(puente?.branchId || ''),
  url: '',
  token: '',
  predeterminado: Boolean(predeterminado),
  backend: true,
  online: Boolean(puente?.online),
  lastSeenAt: puente?.lastSeenAt || null,
  version: String(puente?.version || ''),
  plataforma: String(puente?.platform || ''),
})

export const impresoraDesdeBackend = (impresora) => ({
  id: String(impresora?.id || ''),
  nombre: String(impresora?.name || ''),
  marca: String(impresora?.brand || ''),
  modelo: String(impresora?.model || ''),
  ubicacion: String(impresora?.location || ''),
  conexion: impresora?.connection === 'cups' ? 'cups' : 'lan',
  destino: normalizarDestino(impresora?.destination || ''),
  ancho: Number(impresora?.width) === 58 ? 58 : 80,
  copias: Math.min(5, Math.max(1, Number(impresora?.copies) || 1)),
  corte: impresora?.cut !== false,
  densidad: Math.min(5, Math.max(1, Number(impresora?.density) || 3)),
  caracteres: impresora?.characters !== false,
  predeterminada: Boolean(impresora?.isDefault),
  activa: impresora?.isActive !== false,
  bridgeId: impresora?.bridgeId || '',
  branchId: impresora?.branchId || '',
  ultimaPrueba: impresora?.lastTest || null,
  origen: 'backend',
})

export const impresoraHaciaBackend = (impresora) => ({
  name: String(impresora?.nombre || '').trim(),
  brand: String(impresora?.marca || '').trim(),
  model: String(impresora?.modelo || '').trim(),
  location: String(impresora?.ubicacion || '').trim(),
  connection: impresora?.conexion === 'cups' ? 'cups' : 'lan',
  destination: normalizarDestino(impresora?.destino || ''),
  width: Number(impresora?.ancho) === 58 ? 58 : 80,
  copies: Math.min(5, Math.max(1, Number(impresora?.copias) || 1)),
  cut: impresora?.corte !== false,
  density: Math.min(5, Math.max(1, Number(impresora?.densidad) || 3)),
  characters: impresora?.caracteres !== false,
  isDefault: Boolean(impresora?.predeterminada),
  isActive: impresora?.activa !== false,
  bridgeId: impresora?.bridgeId || null,
  branchId: impresora?.branchId || null,
})

// Refresca la caché desde el backend: el backend manda y pisa lo guardado.
// Lanza si la API no responde; quien llama muestra la última caché.
export async function refrescarDesdeBackend(tenantId, { api: cliente = printingApi } = {}) {
  const datos = await cliente.impresoras()
  const anterior = cargarImpresoras(tenantId)
  const sucursales = Array.isArray(datos?.branches)
    ? datos.branches.map((sucursal) => ({ id: String(sucursal?.id || ''), nombre: String(sucursal?.name || ''), activa: sucursal?.isActive !== false, hasSales: Boolean(sucursal?.hasSales) }))
    : anterior.sucursales || []
  const siguiente = normalizarCache({
    ...anterior,
    syncedAt: new Date().toISOString(),
    remoteEnabled: datos?.remoteEnabled !== false,
    bridges: (datos?.bridges || []).map((puente, indice) => puenteDesdeBackend(puente, indice === 0)),
    impresoras: (datos?.printers || []).map(impresoraDesdeBackend),
    sucursales,
  })
  escribir(claveTenant(tenantId), siguiente)
  return siguiente
}

// Import único de la configuración legacy por dispositivo. El backend responde
// 409 si otro dispositivo ya importó: se marca igual y se refresca. Cualquier
// otro error NO marca: se reintenta en la próxima consulta.
export async function importarConfigUnaVez(tenantId, { api: cliente = printingApi } = {}) {
  const actual = cargarImpresoras(tenantId)
  if (actual.importedAt) return { importado: false, motivo: 'ya-importado' }
  const impresoras = actual.impresoras || []
  const bridges = (actual.bridges || []).filter((puente) => String(puente.url || '').trim())
  const marcarImportado = (extra = {}) => {
    const siguiente = normalizarCache({ ...cargarImpresoras(tenantId), importedAt: new Date().toISOString(), ...extra })
    escribir(claveTenant(tenantId), siguiente)
    return siguiente
  }
  if (!impresoras.length && !bridges.length) {
    marcarImportado()
    return { importado: false, motivo: 'sin-config-legacy' }
  }
  try {
    const datos = await cliente.importar({ printers: impresoras, bridges })
    const puenteLocal = bridges.find((puente) => puente.predeterminado) || bridges[0] || null
    const localBridgeId = puenteLocal ? String(datos?.map?.bridges?.[puenteLocal.id] || '') : ''
    marcarImportado({ localBridgeId })
    return { importado: true, impresoras: impresoras.length, puentes: bridges.length }
  } catch (cause) {
    if (cause?.status === 409) {
      marcarImportado()
      return { importado: false, motivo: 'otro-dispositivo' }
    }
    throw cause
  }
}

// Guarda la lista de puentes: un solo predeterminado y espejo de los campos
// viejos (agentUrl/agentToken) para el resto de la app.
export function guardarPuentes(tenantId, bridges) {
  const lista = normalizarPuentes(bridges)
  const predeterminado = lista.find((puente) => puente.predeterminado) || null
  return guardarImpresoras(tenantId, {
    bridges: lista,
    agentUrl: predeterminado?.url || URL_AGENTE,
    agentToken: predeterminado?.token || '',
  })
}

// Estado de un puente puntual (probar desde la lista de puentes).
export async function estadoDePuente(puente) {
  const url = String(puente?.url || '').replace(/\/+$/, '')
  if (!url) throw new Error('El puente no tiene dirección.')
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 2500)
  try {
    const respuesta = await fetch(`${url}/health`, {
      signal: control.signal,
      headers: puente?.token ? { 'x-mobos-print-token': puente.token } : {},
    })
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || datos?.ok !== true) throw new Error(datos?.error || `El puente respondió ${respuesta.status}.`)
    return { disponible: true, version: datos.version || '', equipo: datos.equipo || '', cola: datos.cola || null }
  } finally { clearTimeout(timer) }
}

// Escritura de caché interna (migración/import). La UI NO escribe acá: las
// mutaciones van a la API y después se refresca (caché de solo lectura).
export function guardarImpresoras(tenantId, cambios) {
  const siguiente = normalizarCache({ ...cargarImpresoras(tenantId), ...cambios })
  escribir(claveTenant(tenantId), siguiente)
  return siguiente
}

export const imprimirConDestino = (store, sucursalId = null) => {
  const activas = store.impresoras.filter((item) => item.activa)
  // La impresora de la sucursal activa gana sobre la predeterminada de la
  // empresa: cada sucursal imprime en la suya (#95).
  const deSucursal = sucursalId ? activas.filter((item) => item.branchId === sucursalId) : []
  const predeterminada = deSucursal.find((item) => item.predeterminada) || deSucursal[0] || activas.find((item) => item.predeterminada) || activas[0] || null
  return { predeterminada, activas }
}

// ── Compatibilidad con el flujo viejo ──────────────────────────────────────
// Otros componentes leen configImpresora(): devuelve la impresora
// predeterminada del tenant (o vacío) con la URL y el token del agente.
let tenantActivo = null
let sucursalActiva = null
export function usarTenantImpresoras(tenantId) { tenantActivo = tenantId || null }
// La sucursal de la sesión: la app prefiere la impresora de esa sucursal.
export function usarSucursalImpresoras(branchId) { sucursalActiva = branchId || null }

// Impresora predeterminada de la empresa en ESTE dispositivo (caché local).
export const impresoraPredeterminada = () => imprimirConDestino(cargarImpresoras(tenantActivo), sucursalActiva).predeterminada || null

// Configuración para imprimir: caché local y, si todavía no hay impresora (o
// `forzar`), una consulta al backend. `forzar` se usa cuando la decisión
// importa (documentos): el backend es la autoridad y la caché puede estar
// vieja; si la consulta falla se conserva la caché.
export async function cargarImpresorasRemotas({ forzar = false } = {}) {
  const actual = cargarImpresoras(tenantActivo)
  if (!forzar && imprimirConDestino(actual, sucursalActiva).predeterminada) return actual
  try { return await refrescarDesdeBackend(tenantActivo) } catch { return actual }
}

export const configImpresora = () => {
  const base = { url: URL_AGENTE, impresora: '', ancho: 80, copias: 1, token: '' }
  try {
    const store = cargarImpresoras(tenantActivo)
    const { predeterminada } = imprimirConDestino(store, sucursalActiva)
    // Cada impresora usa su puente; la predeterminada decide el de la app.
    const puente = puenteDe(store, predeterminada)
    const guardado = {
      url: puente.url || URL_AGENTE,
      token: tokenDeAgente(store, puente),
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

const consultarAgente = async (camino, { method = 'GET', body, signal } = {}) => {
  const { url, token } = configImpresora()
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 5000)
  const abortar = () => control.abort()
  if (signal) {
    if (signal.aborted) control.abort()
    else signal.addEventListener('abort', abortar, { once: true })
  }
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
    signal?.removeEventListener?.('abort', abortar)
  }
}

// `opciones.signal` permite abortar la consulta al desmontar quien la pidió
// (p. ej. el sondeo periódico del estado de las impresoras).
export const diagnosticoAgente = (destino, opciones = {}) => consultarAgente(`/diagnostico${destino ? `?destino=${encodeURIComponent(destino)}` : ''}`, opciones)
export const colaAgente = () => consultarAgente('/jobs')
export const historialAgente = (limite = 30) => consultarAgente(`/historial?limite=${limite}`)
export const reintentarFallidos = () => consultarAgente('/jobs/retry', { method: 'POST' })
export const limpiarFallidos = (ids = []) => consultarAgente('/jobs/clear', { method: 'POST', body: { ids } })
export const confirmarJob = (id, sufijo = '') => consultarAgente('/jobs/confirm', { method: 'POST', body: { id, sufijo } })
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

// ── Camino remoto (backend como intermediario) ────────────────────────────
// En un dispositivo sin agente local, o con la impresora en otro puente, el
// trabajo se encola por HTTPS con la sesión y lo imprime el puente que reclama.

// Camino que le toca a una impresora en ESTE dispositivo, consultando el
// agente local (loopback). No imprime nada: solo decide.
export async function caminoDeImpresion(store, impresora) {
  const estado = await estadoAgente()
  return { ...resolverCamino(store, impresora, { disponible: Boolean(estado?.disponible) }), agente: estado }
}

// Encola un ticket en el backend para que lo imprima el puente. El sufijo de
// confirmación viaja hasheado del lado del servidor: nunca se guarda en claro.
// `ref` identifica el documento/pedido (cola, guarda anti-duplicados y
// auditoría); `reimprimir` es la confirmación explícita "Reimprimir igual".
export async function encolarRemoto(ticket, { impresora, copias, usuario = '', tipo = '', equipo = '', puente = null, tokenPista = '', ref = '', reimprimir = false } = {}) {
  const sufijo = String(ticket?.sufijo ?? '')
  const cuerpo = {
    path: 'REMOTO',
    destination: String(impresora?.destino || ''),
    payload: ticket.base64(),
    kind: String(tipo || 'prueba').slice(0, 40),
    validation: String(ticket?.validacion || '').slice(0, 12),
    suffix: sufijo.slice(0, 8),
    reference: String(ref || ticket?.ref || '').slice(0, 64),
    requestedByName: String(usuario || '').slice(0, 80),
    deviceName: String(equipo || '').slice(0, 80),
    bridgeName: String(puente?.nombre || '').slice(0, 80),
    tokenHint: String(tokenPista || '').slice(0, 40),
    mode: String(impresora?.conexion || '').slice(0, 40),
    width: Number(impresora?.ancho) === 58 ? 58 : 80,
    copies: Math.min(5, Math.max(1, Number(copias) || Number(impresora?.copias) || 1)),
    ...(esIdBackend(impresora?.id) ? { printerId: impresora.id } : {}),
    ...(impresora?.branchId ? { branchId: impresora.branchId } : {}),
    ...(ticket?.ref ? { idempotencyKey: `ticket-${ticket.ref}` } : {}),
    ...(reimprimir ? { force: true } : {}),
  }
  try {
    const datos = await printingApi.encolar(cuerpo)
    return { ok: true, remoto: true, encolado: true, job: datos?.job || null, jobId: datos?.job?.id || null }
  } catch (cause) {
    // Guarda anti-duplicados (#128): el backend bloquea el click repetido y
    // devuelve el trabajo pendiente; quien llama ofrece "Reimprimir igual"
    // (reimprimir=true) y decide la persona.
    if (cause?.details?.duplicate) {
      return { ok: false, remoto: true, duplicado: true, job: cause.details.job || null, error: cause?.message || 'Ya hay una impresión pendiente para este documento.' }
    }
    return { ok: false, remoto: true, error: cause?.message || 'No se pudo encolar el trabajo en el servidor.', status: cause?.status || 0 }
  }
}

// Router local↔remoto: en la Mac del puente imprime por 127.0.0.1; en
// cualquier otro dispositivo encola remoto. Nunca los dos caminos por el mismo
// trabajo: el remoto solo se usa si el local falló ANTES de aceptar.
export async function imprimirTicketRouter(ticket, { store, impresora, copias, usuario = '', tipo = '', equipo = '', puente = null, tokenPista = '', ref = '', reimprimir = false } = {}) {
  const estado = await estadoAgente()
  const { camino } = resolverCamino(store, impresora, { disponible: Boolean(estado?.disponible) })
  if (camino === 'local') {
    const local = await imprimirTicketDirecto(ticket, {
      ancho: impresora?.ancho,
      copias,
      impresora: impresora?.destino,
      usuario,
      ref: ticket?.ref,
      tipo,
      validacion: ticket?.validacion,
      sufijo: ticket?.sufijo,
      puente: puente?.nombre || '',
      tokenPista,
      modo: impresora?.conexion,
    })
    // Aceptado, encolado local o incierto: no se encola remoto (duplicaría).
    if (local.ok || local.encolado || local.incierto) return { ...local, camino: 'local' }
    const remoto = await encolarRemoto(ticket, { impresora, copias, usuario, tipo, equipo, puente, tokenPista, ref, reimprimir })
    return { ...remoto, camino: 'remoto', motivoLocal: local.error }
  }
  const remoto = await encolarRemoto(ticket, { impresora, copias, usuario, tipo, equipo, puente, tokenPista, ref, reimprimir })
  return { ...remoto, camino: 'remoto' }
}

// Best-effort: deja la última prueba en la impresora del backend para que la
// vea cualquier dispositivo. Si falla, la prueba ya ocurrió y no se rompe nada.
export async function registrarUltimaPrueba(impresora, ultimaPrueba) {
  if (!esIdBackend(impresora?.id)) return null
  try {
    return await printingApi.guardarImpresora(impresora.id, { lastTest: ultimaPrueba })
  } catch {
    return null
  }
}

// Manda un ticket (crearTicket().base64()) al agente. Devuelve `{ ok }` o el
// error para mostrarlo en pantalla.
export async function imprimirDirecto(base64, { ancho, copias, impresora, usuario, ref, tipo, validacion, sufijo, puente, tokenPista, modo } = {}) {
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
        validacion: String(validacion || '').slice(0, 12),
        sufijo: String(sufijo ?? '').slice(0, 2),
        puente: String(puente || '').slice(0, 80),
        tokenPista: String(tokenPista || '').slice(0, 40),
        modo: String(modo || '').slice(0, 40),
        data: base64,
      }),
      signal: control.signal,
    })
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || datos?.ok === false) throw new Error(datos?.error || `El agente respondió ${respuesta.status}.`)
    return { ok: true, encolado: Boolean(datos?.encolado), incierto: Boolean(datos?.incierto), estado: datos?.estado || '', transporte: datos?.transporte || '', error: datos?.error || '', jobId: datos?.jobId || null }
  } catch (cause) {
    const mensaje = cause?.name === 'AbortError' ? 'El agente de impresión no respondió.' : cause?.message || 'No se pudo imprimir.'
    // Sin respuesta no se sabe si el agente aceptó: se marca incierto para no
    // encolar el mismo ticket por el camino remoto.
    const incierto = cause?.name === 'AbortError' || cause instanceof TypeError
    return { ok: false, incierto, error: mensaje }
  } finally {
    clearTimeout(timer)
  }
}

export async function imprimirTicketDirecto(ticket, opciones = {}) {
  return imprimirDirecto(ticket.base64(), opciones)
}

// Impresión de documentos del negocio (comprobante, etiquetas, recepción) por
// el camino local o remoto, con la impresora predeterminada de la empresa.
// NUNCA abre el diálogo del navegador por su cuenta: tras un envío fallido,
// incierto o encolado eso podría duplicar el ticket. Devuelve el resultado
// normalizado para que quien llama decida con `puedeCaerAlDialogo`.
//   ok + directo    → salió por el agente local
//   ok + encolado   → quedó en la cola local o en la del puente (remoto)
//   !ok + motivo    → fallo/sin-impresora/agente-no-disponible/incierto/en-cola
export async function imprimirDocumento(ticket, { tipo = '', equipo = '', usuario = '', copias, store = null, impresora = null, ref = '', reimprimir = false } = {}) {
  const estado = await estadoAgente()
  // Sin agente local, la configuración del backend manda: el celular puede
  // tener la caché vieja (u otra predeterminada) y el trabajo saldría al
  // destino equivocado. Si el backend no responde, se usa la última caché.
  let actual = store || (estado?.disponible ? cargarImpresoras(tenantActivo) : await cargarImpresorasRemotas({ forzar: true }))
  const elegida = impresora || imprimirConDestino(actual, sucursalActiva).predeterminada
  const puente = puenteDe(actual, elegida)
  const { camino } = resolverCamino(actual, elegida, { disponible: Boolean(estado?.disponible) })
  if (camino === 'local') {
    const local = await imprimirTicketDirecto(ticket, {
      ancho: elegida?.ancho,
      copias,
      impresora: elegida?.destino,
      usuario,
      tipo,
      ref: ticket?.ref,
      validacion: ticket?.validacion,
      sufijo: ticket?.sufijo,
      puente: puente?.nombre || '',
      modo: elegida?.conexion,
    })
    if (local.ok || local.encolado || local.incierto) {
      return {
        ...local,
        ok: Boolean(local.ok),
        directo: Boolean(local.ok) && !local.encolado,
        camino: 'local',
        motivo: local.incierto ? 'incierto' : local.encolado ? 'en-cola' : '',
      }
    }
    // El agente local rechazó ANTES de aceptar: recién ahí vale el remoto.
    if (elegida?.destino) {
      const remoto = await encolarRemoto(ticket, { impresora: elegida, copias, usuario, tipo, equipo, puente, ref, reimprimir })
      if (remoto.ok) return { ...remoto, camino: 'remoto' }
      if (remoto.duplicado) return { ok: false, camino: 'remoto', motivo: 'duplicado', duplicado: true, job: remoto.job || null, error: remoto.error }
      return { ok: false, camino: 'remoto', motivo: 'fallo', error: remoto.error || local.error || 'No se pudo imprimir.' }
    }
    return { ok: false, camino: 'local', motivo: local.incierto ? 'incierto' : 'fallo', error: local.error || 'No se pudo imprimir.' }
  }
  // Camino remoto: sin agente local, o con la impresora en otro puente.
  if (!elegida?.destino) {
    return { ok: false, camino: 'remoto', motivo: estado?.disponible ? 'sin-impresora' : 'agente-no-disponible', error: 'No hay impresora configurada.' }
  }
  const remoto = await encolarRemoto(ticket, { impresora: elegida, copias, usuario, tipo, equipo, puente, ref, reimprimir })
  if (remoto.ok) return { ...remoto, camino: 'remoto' }
  if (remoto.duplicado) return { ok: false, camino: 'remoto', motivo: 'duplicado', duplicado: true, job: remoto.job || null, error: remoto.error }
  return { ok: false, camino: 'remoto', motivo: 'fallo', error: remoto.error || 'No se pudo encolar el trabajo.' }
}

// Diálogo de impresión del navegador: acción MANUAL y explícita (no permite
// impresión silenciosa). Devuelve false si no había HTML para mostrar.
export function imprimirConDialogo(html) {
  if (typeof html !== 'string' || !html.trim()) return false
  printHtml(html)
  return true
}
