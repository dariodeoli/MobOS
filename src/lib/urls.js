export const publicUrls = {
  landing: 'https://moboss.online',
  app: 'https://app.moboss.online',
  api: 'https://api.moboss.online',
  clientPortal: 'https://clientes.moboss.online',
}

// Ruta interna segura para volver después del login (parámetro `next`). Solo
// aceptamos rutas del propio origen: empiezan con `/` y nunca con `//` (que el
// navegador interpreta como otro host).
export function rutaInterna(valor = '') {
  const ruta = String(valor || '').trim()
  if (!ruta.startsWith('/') || ruta.startsWith('//')) return ''
  return ruta
}

// Enlace de login con retorno: `/login?next=<ruta interna>`.
export function enlaceLogin(destino = '') {
  const ruta = rutaInterna(destino)
  return ruta ? `/login?next=${encodeURIComponent(ruta)}` : '/login'
}
