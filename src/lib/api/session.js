import { api, API_URL, TOKEN_KEY } from './client'

const COMPANY_TOKEN_KEY = 'owncoding_hub_company_token'
const COMPANY_CONTEXT_KEY = 'owncoding_hub_company_context'

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

export function clearAccessToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

export function getCompanyToken() {
  try { return localStorage.getItem(COMPANY_TOKEN_KEY) } catch { return null }
}

export function getCompanyContext() {
  try { return JSON.parse(localStorage.getItem(COMPANY_CONTEXT_KEY) || 'null') } catch { return null }
}

export function setCompanyToken(token) {
  if (!token) return clearCompanyToken()
  localStorage.setItem(COMPANY_TOKEN_KEY, token)
}

function setCompanyContext(context) {
  try { localStorage.setItem(COMPANY_CONTEXT_KEY, JSON.stringify(context)) } catch {}
}

export function clearCompanyToken() {
  try { localStorage.removeItem(COMPANY_TOKEN_KEY); localStorage.removeItem(COMPANY_CONTEXT_KEY) } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Puede ocurrir en contextos sin almacenamiento disponible.
  }
  clearCompanyToken()
}

/** Sesiones del API propio de MobOS. */
export const sessionApi = {
  startGoogle: async (create = false) => {
    if (!API_URL) throw new Error('La URL del servidor no está configurada.')
    const status = await api.get('/api/auth/google?status=1')
    if (!status?.configured) throw new Error('El acceso con Google todavía no está configurado.')
    window.location.assign(`${API_URL}/api/auth/google?intent=${create ? 'create' : 'login'}`)
  },
  completeGoogle: async (body) => {
    const session = await api.post('/api/auth/google/complete', body, { credentials: 'include', headers: { Authorization: '' } })
    clearSession()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    return session
  },
  loginCompany: async (credentials) => {
    const session = await api.post('/api/auth/login', credentials)
    if (!session?.companyToken) throw new Error('El servidor no devolvió un token de empresa válido.')
    setCompanyToken(session.companyToken)
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [] })
    return session
  },
  loginSeller: async (credentials) => {
    const companyToken = getCompanyToken()
    if (!companyToken && !getCompanyContext()?.cookieSession) throw new Error('Primero hay que autenticar la empresa.')
    const session = await api.post('/api/auth/pin', credentials, {
      credentials: 'include',
      headers: { Authorization: companyToken ? `Bearer ${companyToken}` : '' },
    })
    if (!session?.accessToken) throw new Error('El servidor no devolvió una sesión válida.')
    setAccessToken(session.accessToken)
    return session
  },
  // Alias temporal para consumidores que ya conocen el flujo PIN.
  login: (credentials) => sessionApi.loginSeller(credentials),
  me: () => api.get('/api/auth/me'),
  logoutSeller: () => api.post('/api/auth/logout'),
  logoutCompany: () => {
    const companyToken = getCompanyToken()
    return companyToken
      ? api.post('/api/auth/logout', undefined, { headers: { Authorization: `Bearer ${companyToken}` } })
      : getCompanyContext()?.cookieSession
        ? api.post('/api/auth/logout', undefined, { credentials: 'include', headers: { Authorization: '' } })
        : Promise.resolve({ ok: true })
  },
  logout: async () => {
    const results = await Promise.allSettled([sessionApi.logoutSeller(), sessionApi.logoutCompany()])
    clearSession()
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
    return { ok: true }
  },
  switchSeller: async (credentials) => {
    await sessionApi.logoutSeller()
    clearAccessToken()
    return sessionApi.loginSeller(credentials)
  },
}
