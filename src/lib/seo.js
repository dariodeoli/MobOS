import { APP_NAME, APP_VERSION } from '@/lib/brand'

export const pageLabels = {
  '/control/resumen': 'Resumen',
  '/control/reportes': 'Reportes',
  '/control/ganancias': 'Ganancias',
  '/pos/cargar': 'Punto de venta',
  '/pos/clientes': 'Clientes',
  '/pos/pedidos': 'Pedidos',
  '/login': 'Acceso',
  '/demo': 'Demo interactiva',
  '/status': 'Estado del sistema',
}

export function applyPageMetadata({ pathname, publicPage }) {
  const origin = window.location.origin
  const label = pageLabels[pathname]
  const landing = publicPage && pathname === '/'
  const title = landing
    ? `${APP_NAME} · Control total para tu tienda móvil`
    : `${label || 'Gestión de tienda'} · ${APP_NAME}`
  const description = landing
    ? 'POS, inventario por IMEI, caja, clientes, compras, garantías y posventa para tiendas de celulares y accesorios.'
    : `${label || 'Gestión'} en ${APP_NAME}, el sistema operativo para tiendas móviles.`
  document.title = title

  const setMeta = (selector, attribute, value) => document.head.querySelector(selector)?.setAttribute(attribute, value)
  document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', `${origin}${pathname}`)
  const version = APP_VERSION.replace(/^v/, '')
  document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]').forEach((link) => {
    const href = link.getAttribute('href')?.split('?')[0]
    if (href) link.setAttribute('href', `${href}?v=${version}`)
  })
  setMeta('meta[property="og:url"]', 'content', `${origin}${pathname}`)
  setMeta('meta[property="og:title"]', 'content', title)
  setMeta('meta[property="og:description"]', 'content', description)
  setMeta('meta[name="twitter:title"]', 'content', title)
  setMeta('meta[name="twitter:description"]', 'content', description)
  setMeta('meta[name="description"]', 'content', description)
  setMeta('meta[name="robots"]', 'content', publicPage ? 'index, follow' : 'noindex, nofollow')
}
