import { api, API_URL } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { isNativeIOS } from '@/lib/plataforma'

const RUTA = '/api/inventory-reservations/holds'

/**
 * Libera todo lo retenido por un carrito al cerrar la pestaña o la sesión.
 * `sendBeacon` sobrevive al cierre de la página (text/plain: sin preflight);
 * en la app de iPhone (Bearer, sin cookies) y como respaldo va un fetch con
 * `keepalive`. El TTL de 5 minutos cubre lo que se escape.
 */
export function liberarAlSalir(cartId) {
  if (!cartId || isDemoRuntime) return
  const cuerpo = JSON.stringify({ action: 'release', cartId })
  try {
    if (API_URL && !isNativeIOS() && typeof navigator !== 'undefined' && navigator.sendBeacon?.(`${API_URL}${RUTA}`, new Blob([cuerpo], { type: 'text/plain' }))) return
  } catch (error) {
    console.error('[retencion] sendBeacon falló:', error)
  }
  api.post(RUTA, { action: 'release', cartId }, { keepalive: true }).catch(error => console.error('[retencion] no se pudo liberar al salir:', error))
}
