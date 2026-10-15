import { isNativeIOS } from '../plataforma.js'
import { pedirNonce } from './nonce.js'

// Google nativo (hoja del sistema, sin WebView embebido: Google lo bloquea).
// El plugin devuelve un idToken que el API valida en `POST /api/auth/google/native`.
// El ID de cliente de iOS se define al compilar (VITE_GOOGLE_IOS_CLIENT_ID).

export const GOOGLE_IOS_CLIENT_ID = String(import.meta.env?.VITE_GOOGLE_IOS_CLIENT_ID || '500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh.apps.googleusercontent.com')
export const GOOGLE_WEB_CLIENT_ID = String(import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID || '')

/** Google nativo se ofrece solo en la app y solo si el build trae el ID de cliente. */
export function googleNativoDisponible() {
  return isNativeIOS() && Boolean(GOOGLE_IOS_CLIENT_ID)
}

let inicializado = false

export async function iniciarSesionConGoogle({ purpose = 'login' } = {}) {
  if (!googleNativoDisponible()) throw new Error('Google no está disponible en esta versión de la app.')
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  if (!inicializado) {
    await SocialLogin.initialize({ google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, ...(GOOGLE_WEB_CLIENT_ID ? { iOSServerClientId: GOOGLE_WEB_CLIENT_ID } : {}) } })
    inicializado = true
  }
  // Nonce del servidor: Google lo copia tal cual al claim `nonce` del idToken.
  const nonce = await pedirNonce(purpose)
  let respuesta
  try {
    respuesta = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'], nonce } })
  } catch (error) {
    const cancelado = /cancel|1001|-5/i.test(String(error?.code || error?.message || ''))
    const e = new Error(cancelado ? 'Cancelaste el acceso con Google.' : 'No se pudo completar el acceso con Google. Probá de nuevo.')
    e.cancelado = cancelado
    throw e
  }
  const idToken = respuesta?.result?.idToken
  if (!idToken) throw new Error('Google no devolvió la identidad. Probá de nuevo.')
  return { idToken, nonce }
}
