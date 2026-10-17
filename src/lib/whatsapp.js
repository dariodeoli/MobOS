// Construye enlaces seguros de WhatsApp para contactos públicos de sucursal.
// El mensaje queda precargado, pero nunca se envía automáticamente.
export function enlaceWhatsApp(contactoUrl, mensaje = '') {
  try {
    const url = new URL(contactoUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me') return ''
    if (!/^\/?\d{6,20}$/.test(url.pathname)) return ''
    const texto = typeof mensaje === 'string' ? mensaje.trim() : ''
    if (texto) url.searchParams.set('text', texto)
    return url.toString()
  } catch {
    return ''
  }
}
