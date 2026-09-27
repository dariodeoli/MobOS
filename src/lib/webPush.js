// A1 (#279) · Cliente de Web Push: pide permiso, registra la suscripción del
// navegador contra el panel y la sincroniza al arrancar (sin volver a pedir
// permiso). La bandeja interna sigue siendo la fuente oficial; el push solo
// avisa y nunca lleva datos sensibles.
import { API_URL, api } from '@/lib/api'

export function webPushSoportado() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
}

/** base64url (VAPID) → Uint8Array para `applicationServerKey`. */
export function urlBase64AUint8Array(base64) {
  const relleno = '='.repeat((4 - (String(base64 || '').length % 4)) % 4)
  const normalizado = String(base64 || '').replace(/-/g, '+').replace(/_/g, '/') + relleno
  const crudo = atob(normalizado)
  const bytes = new Uint8Array(crudo.length)
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i)
  return bytes
}

export async function estadoWebPush() {
  if (!webPushSoportado()) return { soportado: false, permiso: 'no-soportado', suscripto: false }
  const registro = await navigator.serviceWorker.getRegistration()
  const suscripcion = registro ? await registro.pushManager.getSubscription() : null
  return { soportado: true, permiso: Notification.permission, suscripto: Boolean(suscripcion) }
}

async function registrarEnPanel(suscripcion, silencio) {
  const cuerpo = { suscripcion: suscripcion.toJSON(), userAgent: navigator.userAgent, ...(silencio || {}) }
  return api.post('/api/push/suscripciones', cuerpo)
}

/** Alta: permiso → suscripción del navegador → registro en el panel. */
export async function activarWebPush({ silencioDesde = null, silencioHasta = null } = {}) {
  if (!webPushSoportado()) return { ok: false, motivo: 'no-soportado' }
  const clave = await api.get('/api/push/clave')
  if (!clave?.configurado || !clave?.clave) return { ok: false, motivo: 'sin-configurar' }
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, motivo: permiso === 'denied' ? 'denegado' : 'sin-permiso' }
  const registro = await navigator.serviceWorker.ready
  const existente = await registro.pushManager.getSubscription()
  const suscripcion = existente || await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64AUint8Array(clave.clave) })
  await registrarEnPanel(suscripcion, { silencioDesde, silencioHasta })
  return { ok: true, permiso }
}

/** Baja: se avisa al panel y se libera la suscripción del navegador. */
export async function desactivarWebPush() {
  if (!webPushSoportado()) return { ok: false, motivo: 'no-soportado' }
  const registro = await navigator.serviceWorker.getRegistration()
  const suscripcion = registro ? await registro.pushManager.getSubscription() : null
  if (!suscripcion) return { ok: true }
  try { await api.delete('/api/push/suscripciones', { body: { endpoint: suscripcion.endpoint } }) } catch { /* se libera igual */ }
  await suscripcion.unsubscribe().catch(() => {})
  return { ok: true }
}

/**
 * Sincroniza al arrancar: si ya hay permiso y suscripción, la vuelve a registrar
 * (el endpoint pudo cambiar) sin pedir nada al usuario.
 */
export async function sincronizarWebPush() {
  if (!webPushSoportado() || Notification.permission !== 'granted') return false
  try {
    const registro = await navigator.serviceWorker.getRegistration()
    const suscripcion = registro ? await registro.pushManager.getSubscription() : null
    if (!suscripcion) return false
    await registrarEnPanel(suscripcion, null)
    return true
  } catch {
    return false
  }
}

/** Despacha los eventos nuevos del usuario (menciones, cotización, etc.). */
export async function sincronizarEventosWebPush() {
  try { return await api.post('/api/push/sincronizar', {}) } catch { return null }
}

export async function avisoDePrueba() {
  return api.post('/api/push/prueba', {})
}

export const WEBPUSH_API = API_URL
