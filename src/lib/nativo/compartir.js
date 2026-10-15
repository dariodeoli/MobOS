import { isNativeIOS } from '../plataforma.js'

/**
 * Comparte texto/enlace con la hoja nativa de iOS (WhatsApp, Mensajes, Mail…).
 * Fuera de la app devuelve false para que el llamador use su camino web
 * (navigator.share, wa.me o copiar).
 */
export async function compartirNativo({ titulo, texto, url, dialogo } = {}) {
  if (!isNativeIOS()) return false
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: titulo, text: texto, url, dialogTitle: dialogo || titulo })
    return true
  } catch (error) {
    // Cancelar la hoja no es un error: se considera atendido.
    if (/cancel/i.test(String(error?.message || ''))) return true
    console.error('[compartir] falló la hoja nativa:', error)
    return false
  }
}
