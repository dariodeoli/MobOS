import { api, API_URL, invalidarConsultas } from './client'
import { limpiarTokens, cabecerasNativas } from './nativo'
import { isNativeIOS } from '../plataforma'
import { desactivarPush } from '../nativo/push'

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
  // Cambiar de empresa no puede dejar consultas de la anterior en memoria.
  invalidarConsultas()
}

export function clearSession() {
  clearLegacyTokens()
  clearCompanyToken()
  // App de iPhone: el Bearer del Keychain también se va (la memoria se vacía
  // en el acto; el borrado del Keychain termina en segundo plano).
  if (isNativeIOS()) return limpiarTokens().catch((error) => console.error('[sesion] no se pudo limpiar el Keychain:', error))
}

// Tras cambiar de empresa sin sesión de vendedor en el destino, la recarga cae en
// la pantalla de PIN: este marcador de una sola vez evita que la validación de
// arranque borre el contexto de empresa que el PIN necesita.
const PIN_TRAS_CAMBIO_KEY = 'mobos:pin-tras-cambio'
const HANDOFF_VENTA_KEY = 'mobos:venta-handoff'

export function consumirPinTrasCambio() {
  try {
    const activo = sessionStorage.getItem(PIN_TRAS_CAMBIO_KEY) === '1'
    sessionStorage.removeItem(PIN_TRAS_CAMBIO_KEY)
    return activo
  } catch { return false }
}

// Aplica la sesión que devuelven switch-tenant y companies: borra todo rastro
// en memoria/almacenamiento de la empresa anterior y deja el contexto nuevo.
function aplicarSesionDeEmpresa(session) {
  if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
  clearCompanyToken()
  try { sessionStorage.removeItem(HANDOFF_VENTA_KEY) } catch {}
  setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], onboardingRequired: Boolean(session.onboardingRequired), cookieSession: true })
  try { if (session.user) sessionStorage.removeItem(PIN_TRAS_CAMBIO_KEY); else sessionStorage.setItem(PIN_TRAS_CAMBIO_KEY, '1') } catch {}
  return session
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
    if (session?.storeRequired) {
      // La persona tiene varias tiendas y todavía no eligió una: no hay sesión
      // de empresa todavía, solo se recuerdan las tiendas para el selector.
      const anterior = getCompanyContext() || {}
      setCompanyContext({ ...anterior, stores: session.stores || [] })
      return session
    }
    clearSession()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], profile: session.profile || null, stores: session.stores || [], cookieSession: true })
    return session
  },
  resetPassword: async ({ token, password }) => {
    const session = await api.post('/api/auth/password-reset', { token, password })
    if (session?.tenant) {
      clearLegacyTokens()
      setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    }
    return session
  },
  loginCompany: async (credentials) => {
    const session = await api.post('/api/auth/login', credentials)
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    return session
  },
  // Sign in with Apple (app de iPhone): el API verifica el identityToken, el
  // nonce (se manda el crudo; el servidor compara su sha256) y devuelve la
  // misma sesión de empresa que el login por correo. Solo entra a tiendas que
  // ya existen: sin tienda vinculada responde 403 con un mensaje para mostrar.
  loginApple: async ({ identityToken, authorizationCode, nonce, fullName, storeId }) => {
    const session = await api.post('/api/auth/apple', { identityToken, authorizationCode, nonce, fullName: fullName || null, ...(storeId ? { storeId } : {}) })
    if (session?.storeRequired) {
      const anterior = getCompanyContext() || {}
      setCompanyContext({ ...anterior, stores: session.stores || [] })
      return session
    }
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], profile: session.profile || null, stores: session.stores || [], cookieSession: true })
    return session
  },
  // Google nativo (app de iPhone): el idToken de la hoja del sistema se valida
  // en el API; misma respuesta y mismas reglas que Apple (solo tiendas existentes).
  loginGoogleNativo: async ({ idToken, nonce, storeId }) => {
    const session = await api.post('/api/auth/google/native', { idToken, nonce, ...(storeId ? { storeId } : {}) })
    if (session?.storeRequired) {
      const anterior = getCompanyContext() || {}
      setCompanyContext({ ...anterior, stores: session.stores || [] })
      return session
    }
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], profile: session.profile || null, stores: session.stores || [], cookieSession: true })
    return session
  },
  // Eliminar mi cuenta (guía 5.1.1(v)): re-autenticación en el cuerpo. El
  // dueño de una tienda no puede borrarse sin transferirla o eliminarla antes.
  deleteAccount: async (reauth) => {
    const result = await api.delete('/api/me', { body: reauth })
    clearSession()
    return result
  },
  registerCompany: async (details) => {
    const session = await api.post('/api/auth/register', details)
    if (!session?.tenant) throw new Error('El servidor no pudo abrir la sesión de la empresa.')
    clearLegacyTokens()
    setCompanyContext({ tenant: session.tenant, scope: session.scope, sellers: session.sellers || [], cookieSession: true })
    return session
  },
  // Varias empresas por cuenta (#377): lista, cambio y alta sin volver a Google.
  listTenants: () => api.get('/api/auth/tenants'),
  switchTenant: async (tenantId) => aplicarSesionDeEmpresa(await api.post('/api/auth/switch-tenant', { tenantId })),
  createCompany: async (companyName) => aplicarSesionDeEmpresa(await api.post('/api/auth/companies', { companyName })),
  completeOnboarding: async (details) => {
    const result = await api.post('/api/auth/onboarding', details)
    // El PIN ya está elegido: una recarga no vuelve a pedir la activación.
    const contexto = getCompanyContext()
    if (contexto?.onboardingRequired) setCompanyContext({ ...contexto, onboardingRequired: false })
    return result
  },
  loginSeller: async (credentials, options) => {
    // La autenticación principal (empresa/Google) la exige el servidor: el PIN
    // solo abre la sesión de operador si la cookie de empresa sigue viva y es
    // del mismo origen. El cliente no la cachea en localStorage porque una
    // recarga restaura solo la cookie.
    const session = await api.post('/api/auth/pin', credentials, options)
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
    if (isNativeIOS()) {
      // Capturar ambos permisos antes de borrar el Keychain. La salida local
      // no depende de que haya señal; las revocaciones conservan su Bearer.
      const company = cabecerasNativas('/api/auth/pin')
      const seller = cabecerasNativas('/api/auth/logout')
      const permisos = [...new Set([company.Authorization, seller.Authorization].filter(Boolean))]
      const push = desactivarPush(api)
      const revocaciones = permisos.map(Authorization => api.post('/api/auth/logout', undefined, {
        headers: { Authorization }, timeoutMs: 5000, keepalive: true,
      }))
      await clearSession()
      void Promise.allSettled([push, ...revocaciones]).then(results => {
        for (const result of results) if (result.status === 'rejected') console.error('[sesion] no se pudo revocar el acceso remoto al salir:', result.reason)
      })
      return { ok: true }
    }
    const results = await Promise.allSettled([sessionApi.logoutSeller(), sessionApi.logoutCompany()])
    clearSession()
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
    return { ok: true }
  },
  // Cambiar de operador sin volver a autenticar la empresa: mismo endpoint que
  // el PIN de acceso (el servidor valida PIN + empresa y lo audita). Antes
  // apuntaba a /api/auth/switch, que no existe (#158 lo destrabó).
  switchSeller: ({ sellerId, pin }) => sessionApi.loginSeller({ sellerId, pin }),
}
