import { api, TOKEN_KEY } from './client'

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token) {
  if (!token) return clearSession()
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // La API sigue funcionando con un token administrado por el consumidor.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Puede ocurrir en contextos sin almacenamiento disponible.
  }
}

/** Adaptador futuro: los endpoints se pueden cambiar sin tocar los componentes. */
export const sessionApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  me: () => api.get('/auth/me'),
  logout: async () => {
    try {
      return await api.post('/auth/logout')
    } finally {
      clearSession()
    }
  },
}
