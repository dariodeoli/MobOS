import { publicUrls } from './urls.js'

const DEFAULT_DESCRIPTION = 'Ventas, inventario, caja y clientes para tiendas de celulares y accesorios.'
const SOCIAL_IMAGE = `${publicUrls.landing}/og-card.png`

const exactRoutes = {
  '/': { label: 'Gestión de tienda' },
  '/login': { label: 'Acceso' },
  '/restablecer-contrasena': { label: 'Restablecer contraseña' },
  '/demo': { label: 'Demo interactiva' },
  '/status': {
    label: 'Estado del sistema',
    description: 'Estado operativo de los servicios públicos de MobOS.',
    public: true,
  },
  '/celulares': { label: 'Inventario de celulares' },
  '/comparador': { label: 'Comparador' },
  '/tradein': { label: 'Trade-in' },
}

const protectedSections = {
  '/pos/resumen': 'Resumen',
  '/pos/cargar': 'Punto de venta',
  '/pos/clientes': 'Clientes',
  '/pos/pedidos': 'Pedidos',
  '/pos/productos': 'Productos',
  '/pos/analisis': 'Análisis',
  '/pos/finanzas': 'Finanzas',
  '/pos/equipo': 'Equipo',
  '/configuracion': 'Configuración',
  '/configuracion/equipo': 'Equipo',
  '/configuracion/invitaciones': 'Invitaciones',
  '/configuracion/identidad': 'Mi identidad',
  '/configuracion/roles': 'Roles y permisos',
  '/configuracion/historial': 'Historial',
  '/configuracion/negocio': 'Negocio',
  '/configuracion/sucursales': 'Sucursales',
  '/configuracion/seguridad': 'Seguridad',
  '/configuracion/impresoras': 'Impresoras',
  '/configuracion/impresion': 'Estado de impresión',
  '/configuracion/sistema': 'Estado del sistema',
  '/analisis': 'Análisis',
  '/analisis/reportes': 'Reportes',
  '/analisis/ganancias': 'Ganancias',
  '/analisis/ganadores': 'Ganadores',
  '/analisis/asistente': 'Asistente',
  '/finanzas': 'Finanzas',
  '/finanzas/caja': 'Caja',
  '/finanzas/gastos': 'Gastos',
  '/finanzas/bancos': 'Bancos y cuentas',
  '/finanzas/creditos': 'Créditos',
  '/finanzas/publicidad': 'Publicidad',
  '/inventario': 'Inventario',
  '/inventario/unidades': 'Unidades',
  '/inventario/alertas': 'Alertas',
  '/inventario/reservas': 'Reservas',
  '/inventario/traslados': 'Traslados',
  '/inventario/vendidos': 'Vendidos',
  '/inventario/transito': 'En tránsito',
  '/inventario/ubicaciones': 'Ubicaciones',
  '/inventario/compartido': 'Compartido',
  '/inventario/eliminados': 'Eliminados',
  '/pos/servicio': 'Servicio posventa',
  '/pos/tradein-admin': 'Gestión de trade-in',
  '/pos/plantillas': 'Plantillas de WhatsApp',
}

function normalizePathname(pathname = '/') {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

function resolveRoute(pathname) {
  if (exactRoutes[pathname]) return exactRoutes[pathname]
  if (protectedSections[pathname]) return { label: protectedSections[pathname] }
  if (pathname === '/pos' || pathname.startsWith('/pos/')) return { label: 'Operación de tienda' }
  if (pathname === '/control' || pathname.startsWith('/control/')) return { label: 'Administración' }
  // Documentos públicos por token: el título no debe caer en "no encontrada".
  if (pathname.startsWith('/pedido/') || pathname.startsWith('/p/')) return { label: 'Seguimiento de pedido' }
  if (pathname.startsWith('/garantia/')) return { label: 'Garantía' }
  if (pathname.startsWith('/cotizacion/')) return { label: 'Cotización' }
  if (pathname.startsWith('/cuenta/')) return { label: 'Mi cuenta' }
  if (pathname.startsWith('/portal/')) return { label: 'Portal del cliente' }
  if (pathname.startsWith('/remito/')) return { label: 'Remito de traslado' }
  return { label: 'Página no encontrada', error: true }
}

export function resolvePageMetadata({ pathname, publicPage = false, clientPortal = false, appName = 'MobOS' }) {
  const path = normalizePathname(pathname)
  const route = resolveRoute(path)
  const landing = publicPage && path === '/'
  const indexable = !clientPortal && (landing || (publicPage && route.public === true))
  const canonicalOrigin = clientPortal ? publicUrls.clientPortal : publicPage ? publicUrls.landing : publicUrls.app
  const canonicalPath = route.error ? '/' : path
  const canonical = `${canonicalOrigin}${canonicalPath === '/' ? '/' : canonicalPath}`
  const title = clientPortal
    ? path === '/' ? `Portal de clientes · ${appName}` : `${route.label} · ${appName}`
    : landing
    ? `${appName} · Control total para tu tienda móvil`
    : `${route.label} · ${appName}`
  const description = clientPortal
    ? 'Accedé de forma segura a tu cuenta, pedidos, comprobantes y garantías mediante el enlace que te envió tu tienda.'
    : landing
    ? 'POS, inventario por IMEI, caja, clientes, compras, garantías y posventa para tiendas de celulares y accesorios.'
    : route.description || `${route.label} en ${appName}. ${DEFAULT_DESCRIPTION}`

  return {
    canonical,
    description,
    indexable,
    landing: landing && !clientPortal,
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
    socialImage: SOCIAL_IMAGE,
    title,
  }
}

export function landingStructuredData(appName = 'MobOS') {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: appName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${publicUrls.landing}/`,
    description: 'Sistema de ventas, inventario, caja, clientes y posventa para tiendas de celulares y accesorios.',
  }
}
