// Slugs simples y profesionales de la operación (issue #116): /ventas,
// /pedidos, /delivery, /configuracion/… Fuente única para armar enlaces
// internos, resolver la vista activa y redirigir las URLs viejas que colgaban
// de /pos.

// id de vista del panel (nav) → URL canónica.
export const RUTA_DE_VISTA = {
  cargar: '/pos',
  pedidos: '/pedidos',
  repartos: '/delivery',
  clientes: '/clientes',
  productos: '/productos',
  promociones: '/promociones',
  precios: '/precios',
  cotizaciones: '/cotizaciones',
  plantillas: '/plantillas',
  cotizador: '/trade-in',
  'tradein-admin': '/trade-in',
  inventario: '/inventario',
  compras: '/compras',
  servicio: '/servicio',
  garantias: '/garantias',
  autorizaciones: '/autorizaciones',
  resumen: '/resumen',
  ops: '/ops',
  analisis: '/analisis',
  finanzas: '/finanzas',
  equipo: '/configuracion',
  'mi-cuenta': '/mi-cuenta',
  celulares: '/celulares',
  comparador: '/comparador',
}

// URL canónica de una vista; null si el id no existe.
export function rutaDeVista(id) {
  return RUTA_DE_VISTA[id] || null
}

const VISTA_DE_RUTA = Object.fromEntries(
  Object.entries(RUTA_DE_VISTA)
    .filter(([id]) => id !== 'tradein-admin')
    .map(([id, ruta]) => [ruta.slice(1), id]),
)

// slug de la URL → id de vista del panel. Trade-In se unifica en /trade-in:
// el dueño ve la pipeline y el resto el cotizador.
export function vistaDeRuta(slug, { esOwner = false } = {}) {
  if (slug === 'trade-in') return esOwner ? 'tradein-admin' : 'cotizador'
  return VISTA_DE_RUTA[slug] || null
}

// Compatibilidad: URL vieja → URL nueva. Cubre /pos/<vista>, los slugs planos
// que alguna vez resolvió el panel y las pestañas que llegaban por
// /control/<tab>. Los valores siempre son destinos canónicos.
export const DESTINO_LEGADO = {
  '': '/pos',
  cargar: '/pos',
  // El slug de #116 (/ventas) sigue siendo un enlace válido: va al POS.
  ventas: '/pos',
  pedidos: '/pedidos',
  repartos: '/delivery',
  clientes: '/clientes',
  productos: '/productos',
  promociones: '/promociones',
  precios: '/precios',
  cotizaciones: '/cotizaciones',
  plantillas: '/plantillas',
  cotizador: '/trade-in',
  'tradein-admin': '/trade-in',
  tradein: '/trade-in',
  // #251: el menú dice «Inicio»; /resumen sigue siendo la ruta canónica.
  inicio: '/resumen',
  inventario: '/inventario',
  compras: '/compras',
  servicio: '/servicio',
  garantias: '/garantias',
  autorizaciones: '/autorizaciones',
  resumen: '/resumen',
  ops: '/ops',
  analisis: '/analisis',
  finanzas: '/finanzas',
  equipo: '/configuracion',
  config: '/configuracion',
  configuracion: '/configuracion',
  // #253: Mi cuenta es personal y su URL canónica es /mi-cuenta (el dueño la
  // sigue viendo como pestaña de Configuración).
  'mi-cuenta': '/mi-cuenta',
  vendedores: '/configuracion',
  // Slugs planos de las pestañas que resolvía el panel viejo.
  seguridad: '/configuracion/seguridad',
  identidad: '/configuracion/identidad',
  roles: '/configuracion/roles',
  negocio: '/configuracion/negocio',
  sucursales: '/configuracion/sucursales',
  impresoras: '/configuracion/impresoras',
  impresion: '/configuracion/impresoras',
  sistema: '/configuracion/sistema',
  historial: '/configuracion/historial',
  reportes: '/analisis',
  ganancias: '/analisis',
  ganadores: '/analisis',
  asistente: '/analisis',
  caja: '/finanzas',
  gastos: '/finanzas',
  bancos: '/finanzas',
  creditos: '/finanzas',
  cuotas: '/finanzas',
  comisiones: '/finanzas',
  publicidad: '/finanzas',
  ads: '/finanzas',
  incompletos: '/productos',
  imagenes: '/productos',
  celulares: '/celulares',
  comparador: '/comparador',
}
