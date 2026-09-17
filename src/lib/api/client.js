import { ApiError } from './errors'
import { CACHE_GET_MS, cacheDeConsultas } from './requestCache'

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
export function invalidarConsultas() {
  cacheDeConsultas.invalidarTodo()
}

async function readBody(response) {
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json()
  const text = await response.text()
  return text ? { message: text } : null
}

/** Cliente fetch aislado. No reemplaza ni conoce la implementación de storage.js. */
export async function request(path, options = {}) {
  if (!API_URL) {
    throw new ApiError('VITE_API_URL no está configurada.', { code: 'API_NOT_CONFIGURED' })
  }

  const { body, headers, cacheMs, signal, timeoutMs, ...init } = options
  const metodo = String(init.method || 'GET').toUpperCase()
  const clave = `${metodo} ${path}`
  const ventana = cacheMs ?? CACHE_GET_MS
  if (metodo === 'GET' && ventana > 0) {
    const guardado = cacheDeConsultas.leer(clave)
    if (guardado !== undefined) return guardado
  }
  const espera = controlDeEspera(signal, timeoutMs)
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData
  let response
  try {
    response = await fetch(`${API_URL}/${String(path).replace(/^\//, '')}`, {
      ...init,
      signal: espera.signal,
      // La sesión vive en cookies HttpOnly del API. Nunca persistimos ni
      // reconstruimos tokens de acceso desde JavaScript.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
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

  const payload = await readBody(response)
  if (!response.ok) {
    if (CODIGOS_QUE_INVALIDAN.has(response.status)) cacheDeConsultas.invalidarTodo()
    const retryAfter = response.status === 429 ? Number(response.headers.get('retry-after')) : 0
    const retryHint = Number.isFinite(retryAfter) && retryAfter > 0
      ? ` Reintentá en ${Math.ceil(retryAfter)} s.`
      : response.status === 429 ? ' Reintentá en unos segundos.' : ''
    throw new ApiError(`${payload?.message || `La API respondió con ${response.status}.`}${retryHint}`, {
      status: response.status,
      code: payload?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'API_ERROR'),
      details: payload?.details ?? payload,
    })
  }
  // Una consulta se guarda unos segundos; una mutación invalida todo lo
  // consultado porque cualquier lectura previa pudo quedar desactualizada.
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

export { API_URL }
