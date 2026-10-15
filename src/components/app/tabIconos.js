// Un solo mapa id de pestaña → ícono (set de owncoding-ui). Mismo concepto,
// mismo ícono en toda la app: las pestañas de SectionTabs lo resuelven solas,
// y un ítem puede traer su propio `icon` para anularlo.
export const TAB_ICONOS = {
  // Inicio / Vender
  resumen: 'overview',
  ops: 'pulse',
  cargar: 'plus',
  cotizador: 'refresh',
  'tradein-admin': 'refresh',
  // Ventas
  pedidos: 'receipt',
  cotizaciones: 'report',
  repartos: 'truck',
  autorizaciones: 'lock',
  // Clientes
  clientes: 'users',
  campanas: 'megaphone',
  promociones: 'store',
  plantillas: 'send',
  // Taller
  servicio: 'wrench',
  garantias: 'shield',
  // Stock
  unidades: 'phone',
  productos: 'package',
  traslados: 'transfer',
  control: 'check',
  precios: 'tag',
  taller: 'wrench',
  conteos: 'list',
  verificacion: 'check',
  alertas: 'alert',
  reservas: 'pin',
  vendidos: 'receipt',
  transito: 'truck',
  ubicaciones: 'building',
  compartido: 'share',
  eliminados: 'trash',
  // Compras
  compras: 'cart',
  abastecimiento: 'inventory',
  'compras-centro': 'building',
  preparacion: 'list',
  lotes: 'archive',
  recepcion: 'download',
  metricas: 'chart',
  // Finanzas
  finanzas: 'wallet',
  caja: 'wallet',
  gastos: 'money',
  bancos: 'bank',
  conciliacion: 'audit',
  creditos: 'card',
  cuotas: 'calendar',
  comisiones: 'subscription',
  publicidad: 'megaphone',
  // Análisis
  analisis: 'trending',
  reportes: 'report',
  ganancias: 'trending',
  ganadores: 'trophy',
  asistente: 'sparkles',
  // Configuración
  equipo: 'users',
  organizacion: 'building',
  dispositivos: 'printer',
  comercial: 'store',
  seguridad: 'shield',
  sistema: 'database',
  'mi-cuenta': 'user',
}

export const iconoDeTab = item => item?.icon || TAB_ICONOS[item?.id] || null
