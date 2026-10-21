import { isOwnDataCredentialError, readRucErrorBody } from './rucProviderError.js'
import { ApiError } from './errors'
import { CACHE_GET_MS, cacheDeConsultas } from './requestCache'
import { isDemoRuntime } from '@/lib/demoMode'
import { guardarTokens, opcionesDeSesion } from './nativo'
import { isNativeIOS } from '../plataforma'
import { generacionSnapshots, invalidarSnapshotsPrivados, esDenegacionPrivada } from '../offline/snapshot'

// La variable del Hub tiene prioridad, salvo el host legado: un build con la
// URL anterior provoca un redirect entre orígenes y el navegador bloquea el
// inicio OAuth antes de llegar a Google.
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const API_URL = configuredApiUrl === 'https://api.controlaria.online'
  ? 'https://api.moboss.online'
  : configuredApiUrl

const ESPERA_API_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000)
// Un error de sesión invalida todo lo consultado: puede haber cambiado de
// empresa, de vendedor o haberse revocado el acceso.
const CODIGOS_QUE_INVALIDAN = new Set([401, 402, 403])

// Corta la espera si la API no responde: un pedido colgado no puede dejar la
// pantalla cargando sin fin. Distingue el corte propio del aborto del llamador
// y limpia siempre el temporizador y el listener.
function controlDeEspera(signal, timeoutMs) {
  const controller = new AbortController()
  const ms = timeoutMs ?? ESPERA_API_MS
  let porTiempo = false
  const temporizador = ms > 0 ? setTimeout(() => { porTiempo = true; controller.abort() }, ms) : null
  const abortar = () => controller.abort()
  if (signal) {
    if (signal.aborted) abortar()
    else signal.addEventListener('abort', abortar, { once: true })
  }
  return {
    signal: controller.signal,
    fueTiempo: () => porTiempo,
    limpiar() {
      if (temporizador) clearTimeout(temporizador)
      if (signal) signal.removeEventListener('abort', abortar)
    },
  }
}

// Vacía la caché de consultas (logout, cambio de empresa o de vendedor).
let revisionConsultas = 0
export function invalidarConsultas() {
  revisionConsultas++
  consultasEnVuelo.clear()
  cacheDeConsultas.invalidarTodo()
}

async function readBody(response) {
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json()
  const text = await response.text()
  return text ? { message: text } : null
}

// Consultas GET en vuelo: dos componentes que piden lo mismo al mismo tiempo
// comparten una sola llamada (los duplicados de la carga inicial, #247). La
// caché corta de `requestCache` cubre los pedidos seguidos; esto cubre los
// simultáneos.
const consultasEnVuelo = new Map()

/** Cliente fetch aislado. No reemplaza ni conoce la implementación de storage.js. */
export function request(path, options = {}) {
  // Demo pública (#192): las operaciones de tienda usan datos locales y esta
  // barrera permanece cerrada. La consulta real RUC (#498) tiene un transporte
  // público específico, sin sesión; nunca usa una excepción genérica aquí.
  if (isDemoRuntime) {
    return Promise.reject(new ApiError('Modo demo: la acción quedó simulada en este navegador.', { code: 'DEMO_MODE' }))
  }
  if (!API_URL) {
    return Promise.reject(new ApiError('VITE_API_URL no está configurada.', { code: 'API_NOT_CONFIGURED' }))
  }

  const { body, headers, cacheMs, signal, timeoutMs, ...init } = options
  const metodo = String(init.method || 'GET').toUpperCase()
  const clave = `${metodo} ${path}`
  const ventana = cacheMs ?? CACHE_GET_MS
  // Solo se comparten consultas sin `signal`: abortar una (unmount) no puede
  // abortar la de otro componente.
  const compartible = metodo === 'GET' && ventana > 0 && !signal
  if (compartible) {
    const guardado = cacheDeConsultas.leer(clave)
    if (guardado !== undefined) return Promise.resolve(guardado)
    const enVuelo = consultasEnVuelo.get(clave)
    if (enVuelo) return enVuelo
  } else if (metodo === 'GET' && ventana > 0) {
    const guardado = cacheDeConsultas.leer(clave)
    if (guardado !== undefined) return Promise.resolve(guardado)
  }

  const promesa = ejecutarConsulta({ path, init, body, headers, metodo, clave, ventana, signal, timeoutMs })
  if (compartible) {
    consultasEnVuelo.set(clave, promesa)
    // Limpieza sin propagar el rechazo a nadie: cada llamador recibe la suya.
    const limpiar = () => { if (consultasEnVuelo.get(clave) === promesa) consultasEnVuelo.delete(clave) }
    promesa.then(limpiar, limpiar)
  }
  return promesa
}

async function ejecutarConsulta({ path, init, body, headers, metodo, clave, ventana, signal, timeoutMs }) {
  const revision = revisionConsultas
  const generacion = generacionSnapshots()
  const espera = controlDeEspera(signal, timeoutMs)
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData
  const sesion = opcionesDeSesion(path)
  let response
  try {
    response = await fetch(`${API_URL}/${String(path).replace(/^\//, '')}`, {
      ...init,
      signal: espera.signal,
      // Web: la sesión vive en cookies HttpOnly del API y JavaScript nunca ve
      // un token. App de iPhone: sin cookies, Bearer desde el Keychain y el
      // encabezado `X-MobOS-Client` (ver lib/api/nativo.js).
      credentials: sesion.credentials,
      headers: {
        Accept: 'application/json',
        ...sesion.headers,
        ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined || typeof body === 'string' || multipart ? body : JSON.stringify(body),
    })
  } catch (error) {
    if (espera.fueTiempo()) {
      throw new ApiError('La API tardó demasiado en responder. Reintentá en unos segundos.', {
        code: 'REQUEST_TIMEOUT',
        cause: error,
      })
    }
    throw new ApiError('No se pudo conectar con OwnCoding Hub.', {
      code: error?.name === 'AbortError' ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      cause: error,
    })
  } finally {
    espera.limpiar()
  }

  if (revision !== revisionConsultas) throw new ApiError('El contexto de acceso cambió.', { code: 'CONTEXT_CHANGED' })
  // El estado HTTP deniega aunque el cuerpo esté vacío o tenga JSON inválido.
  const rucDenial = metodo === 'GET' && typeof path === 'string' && path.split('?')[0] === '/api/ruc' && [401, 403].includes(response.status)
  let rucError = null
  if (rucDenial) { try { rucError = await readRucErrorBody(response) } catch { /* fail closed below */ } }
  const providerFailure = rucDenial && isOwnDataCredentialError(path, metodo, response.status, rucError)
  const denegadoPorEstado = CODIGOS_QUE_INVALIDAN.has(response.status) && !providerFailure
  if (denegadoPorEstado) { invalidarConsultas(); await invalidarSnapshotsPrivados({ siGeneracion: generacion }) }
  let payload
  try { payload = rucDenial ? rucError : await readBody(response) } catch (error) {
    if (!denegadoPorEstado) throw error
    payload = null
  }
  if (!denegadoPorEstado && revision !== revisionConsultas) throw new ApiError('El contexto de acceso cambió.', { code: 'CONTEXT_CHANGED' })
  if (signal?.aborted) throw new ApiError('La solicitud fue cancelada.', { code: 'REQUEST_ABORTED' })
  const denegado = denegadoPorEstado || (!providerFailure && esDenegacionPrivada(payload))
  if (!response.ok || denegado) {
    if (denegado && !denegadoPorEstado) { invalidarConsultas(); await invalidarSnapshotsPrivados({ siGeneracion: generacion }) }
    const retryAfter = response.status === 429 ? Number(response.headers.get('retry-after')) : 0
    const retryHint = Number.isFinite(retryAfter) && retryAfter > 0
      ? ` Reintentá en ${Math.ceil(retryAfter)} s.`
      : response.status === 429 ? ' Reintentá en unos segundos.' : ''
    throw new ApiError(`${payload?.message || `La API respondió con ${response.status}.`}${retryHint}`, {
      status: response.ok && denegado ? 403 : response.status,
      code: payload?.code || (providerFailure ? payload.details.code : response.status === 401 ? 'UNAUTHORIZED' : 'API_ERROR'),
      details: payload?.details ?? payload,
    })
  }
  // Una consulta se guarda unos segundos; una mutación invalida todo lo
  // consultado porque cualquier lectura previa pudo quedar desactualizada.
  // El API devuelve `{ token, sellerToken?, expiresAt }` en login/PIN/Google/
  // Apple solo a los clientes nativos: van al Keychain, no al estado de React.
  if (isNativeIOS() && payload && typeof payload === 'object' && (payload.token || payload.sellerToken)) await guardarTokens(payload)
  if (metodo === 'GET') cacheDeConsultas.guardar(clave, payload, ventana)
  else cacheDeConsultas.invalidarTodo()
  return payload
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
}

// Descargas autenticadas (CSV, fotos, comprobantes) que no pasan por request():
// mismo contrato de demo que el resto de la API (#192).
export async function apiFetch(path, options = {}) {
  if (isDemoRuntime) {
    throw new ApiError('Modo demo: la acción quedó simulada en este navegador.', { code: 'DEMO_MODE' })
  }
  if (!API_URL) {
    throw new ApiError('VITE_API_URL no está configurada.', { code: 'API_NOT_CONFIGURED' })
  }
  const sesion = opcionesDeSesion(path)
  const revision = revisionConsultas
  const generacion = generacionSnapshots()
  const response = await fetch(`${API_URL}/${String(path).replace(/^\//, '')}`, {
    credentials: sesion.credentials,
    ...options,
    headers: { ...sesion.headers, ...(options.headers || {}) },
  })
  if (revision !== revisionConsultas) throw new ApiError('El contexto de acceso cambió.', { code: 'CONTEXT_CHANGED' })
  if (CODIGOS_QUE_INVALIDAN.has(response.status)) { invalidarConsultas(); await invalidarSnapshotsPrivados({ siGeneracion: generacion }) }
  return response
}

export { API_URL }
