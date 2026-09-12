import { api, API_URL } from './client'

const COMPANY_CONTEXT_KEY = 'owncoding_hub_company_context'
const LEGACY_KEYS = ['owncoding_hub_access_token', 'owncoding_hub_company_token']

// Compatibilidad sin conservar secretos: las exportaciones viejas se vuelven
// no-op y se limpian en el primer uso de la versión con cookies.
export function getAccessToken() { return null }
export function setAccessToken() { clearLegacyTokens() }
export function clearAccessToken() { clearLegacyTokens() }
export function getCompanyToken() { return null }

export function getCompanyContext() {
  try { return JSON.parse(localStorage.getItem(COMPANY_CONTEXT_KEY) || 'null') } catch { return null }
}

export function setCompanyToken() { clearLegacyTokens() }

function setCompanyContext(context) {
  try { localStorage.setItem(COMPANY_CONTEXT_KEY, JSON.stringify(context)) } catch {}
}

export function clearCompanyToken() {
  try { localStorage.removeItem(COMPANY_CONTEXT_KEY); clearLegacyTokens() } catch {}
}

export function clearSession() {
  clearLegacyTokens()
  clearCompanyToken()
}

function clearLegacyTokens() {
  try { LEGACY_KEYS.forEach(key => localStorage.removeItem(key)) } catch {}
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
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    return session
  },
  registerCompany: async (details) => {
    const session = await api.post('/api/auth/register', details)
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    return session
  },
  completeOnboarding: (details) => api.post('/api/auth/onboarding', details),
  loginSeller: async (credentials) => {
    if (!getCompanyContext()?.cookieSession) throw new Error('Primero hay que autenticar la empresa.')
    const session = await api.post('/api/auth/pin', credentials)
    if (!session?.user) throw new Error('El servidor no devolvió una sesión válida.')
    clearLegacyTokens()
    return session
  },
  // Alias temporal para consumidores que ya conocen el flujo PIN.
  login: (credentials) => sessionApi.loginSeller(credentials),
  me: () => api.get('/api/auth/me'),
  logoutSeller: () => api.post('/api/auth/logout'),
  logoutCompany: () => {
    return getCompanyContext()?.cookieSession ? api.post('/api/auth/logout') : Promise.resolve({ ok: true })
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
