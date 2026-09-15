import { ApiError } from './errors'

// La variable del Hub tiene prioridad, salvo el host legado: un build con la
// URL anterior provoca un redirect entre orígenes y el navegador bloquea el
// inicio OAuth antes de llegar a Google.
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const API_URL = configuredApiUrl === 'https://api.controlaria.online'
  ? 'https://api.moboss.online'
  : configuredApiUrl

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

  const { body, headers, ...init } = options
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData
  let response
  try {
    response = await fetch(`${API_URL}/${String(path).replace(/^\//, '')}`, {
      ...init,
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
    throw new ApiError('No se pudo conectar con OwnCoding Hub.', {
      code: error?.name === 'AbortError' ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      cause: error,
    })
  }

  const payload = await readBody(response)
  if (!response.ok) {
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
