import { ApiError } from './errors'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'owncoding_hub_access_token'

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
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

  const { body, headers, ...init } = options
  const token = readToken()
  let response
  try {
    response = await fetch(`${API_URL}/${String(path).replace(/^\//, '')}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError('No se pudo conectar con OwnCoding Hub.', {
      code: error?.name === 'AbortError' ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      cause: error,
    })
  }

  const payload = await readBody(response)
  if (!response.ok) {
    throw new ApiError(payload?.message || `La API respondió con ${response.status}.`, {
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

export { API_URL, TOKEN_KEY }
