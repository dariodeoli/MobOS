import { isNativeIOS } from '../plataforma.js'

// Notificaciones push (APNs) de la app de iPhone. El permiso se pide en
// contexto, después del primer ingreso y con un aviso previo propio (ver
// components/nativo/AvisoPush.jsx): si la persona lo rechaza, la app sigue
// funcionando igual y no se vuelve a insistir.

const CLAVE_PREVIO = 'mobos:push-previo' // 'si' | 'no'
const CLAVE_TOKEN = 'mobos:push-token'

// Los builds de depuración (Xcode) usan el APNs de pruebas; TestFlight y App
// Store, el de producción. Se fija al compilar: `VITE_PUSH_ENV=sandbox`.
export function entornoPush() {
  return String(import.meta.env?.VITE_PUSH_ENV || '').toLowerCase() === 'sandbox' ? 'sandbox' : 'production'
}

function leer(clave) {
  try { return localStorage.getItem(clave) } catch { return null }
}
function escribir(clave, valor) {
  try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor) } catch { /* sin almacenamiento */ }
}

export function previoRespondido() {
  return leer(CLAVE_PREVIO) !== null
}
export function recordarPrevio(respuesta) {
  escribir(CLAVE_PREVIO, respuesta === 'si' ? 'si' : 'no')
}

/**
 * Destino interno a partir de los datos de la notificación. Solo rutas del
 * propio origen (empiezan con «/», nunca «//»); también entiende `orderId`.
 */
export function rutaDeNotificacion(datos) {
  if (!datos || typeof datos !== 'object') return ''
  const candidata = datos.route || datos.path || datos.url || datos.link || ''
  if (typeof candidata === 'string' && candidata.trim()) {
    let ruta = candidata.trim()
    try {
      const url = new URL(ruta, 'https://app.moboss.online')
      if (/(^|\.)moboss\.online$/.test(url.hostname)) ruta = `${url.pathname}${url.search}${url.hash}`
    } catch { /* ruta relativa o inválida */ }
    if (ruta.startsWith('/') && !ruta.startsWith('//')) return ruta
  }
  const id = datos.orderId || datos.pedidoId
  if (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) return `/pedidos/${encodeURIComponent(id)}`
  return ''
}

async function plugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  return { p: PushNotifications } // envuelto: devolver el plugin crudo haría que await llame a .then()
}

let escuchando = false

/** Estado del permiso: 'granted' | 'denied' | 'prompt' (o 'no-disponible'). */
export async function estadoPermisoPush() {
  if (!isNativeIOS()) return 'no-disponible'
  try { return (await (await plugin()).p.checkPermissions()).receive } catch { return 'no-disponible' }
}

/**
 * Pide el permiso (si hace falta), registra el dispositivo en APNs y envía el
 * token al API. Nunca bloquea: cualquier fallo se registra y se ignora.
 */
export async function activarPush(api) {
  if (!isNativeIOS()) return false
  try {
    const Push = (await plugin()).p
    let permiso = (await Push.checkPermissions()).receive
    if (permiso === 'prompt' || permiso === 'prompt-with-rationale') permiso = (await Push.requestPermissions()).receive
    if (permiso !== 'granted') return false
    if (!escuchando) {
      escuchando = true
      await Push.addListener('registration', async ({ value }) => {
        try {
          await api.post('/api/push/devices', { token: value, platform: 'ios', env: entornoPush() })
          escribir(CLAVE_TOKEN, value)
        } catch (error) { console.error('[push] no se pudo registrar el dispositivo:', error) }
      })
      await Push.addListener('registrationError', (error) => console.error('[push] APNs rechazó el registro:', error))
    }
    await Push.register()
    return true
  } catch (error) {
    console.error('[push] no se pudo activar:', error)
    return false
  }
}

/** Al cerrar sesión: el dispositivo deja de recibir avisos de esa cuenta. */
export async function desactivarPush(api) {
  const token = leer(CLAVE_TOKEN)
  escribir(CLAVE_TOKEN, null)
  if (!token || !isNativeIOS()) return
  try { await api.delete('/api/push/devices', { body: { token } }) } catch (error) { console.error('[push] no se pudo dar de baja el dispositivo:', error) }
}

/** Escucha el toque sobre una notificación y entrega la ruta interna a abrir. */
export async function alTocarNotificacion(abrir) {
  if (!isNativeIOS()) return () => {}
  try {
    const Push = (await plugin()).p
    const handle = await Push.addListener('pushNotificationActionPerformed', (accion) => {
      const ruta = rutaDeNotificacion(accion?.notification?.data)
      if (ruta) abrir(ruta)
    })
    return () => { handle.remove() }
  } catch (error) {
    console.error('[push] no se pudo escuchar los toques:', error)
    return () => {}
  }
}
