// Demo · módulos. Todo activo: la demo siempre ve todas las vistas
// (`moduloActivo` devuelve true con `demo`). La pantalla «Módulos» muestra el
// catálogo con estado ficticio y NO guarda nada.
import { MODULE_CATALOG } from '../modulos.js'

const AHORA_FICTICIA = '2026-10-01T09:00:00.000Z'

/** Respuesta ficticia de GET /api/tenant/modules para la demo (todo disponible activo). */
export function estadoDemoModulos() {
  const modules = {}
  for (const def of MODULE_CATALOG) {
    modules[def.id] = { enabled: def.nucleo || def.status === 'available', manuallySelected: false, source: 'preset', updatedAt: AHORA_FICTICIA }
  }
  return {
    catalogVersion: 2,
    catalog: MODULE_CATALOG,
    presets: ['comercio', 'servicios', 'salud'],
    state: { version: 2, preset: 'comercio', modules },
    canManage: true,
    demo: true,
  }
}

/**
 * Vista de la demo que muestra cada id de navegación o pestaña de un módulo.
 * El test de coherencia exige que cada navId/tabId del catálogo tenga la suya.
 */
export const VISTAS_DEMO = {
  // Núcleo
  clientes: '/clientes', equipo: '/configuracion/equipo',
  cargar: '/pos', pedidos: '/pedidos', cotizaciones: '/cotizaciones', autorizaciones: '/autorizaciones',
  unidades: '/stock/unidades', productos: '/productos', compras: '/compras',
  alertas: '/stock/alertas', vendidos: '/stock/vendidos', eliminados: '/stock/eliminados',
  finanzas: '/finanzas', caja: '/finanzas/caja', gastos: '/finanzas/gastos', bancos: '/finanzas/bancos',
  resumen: '/resumen', analisis: '/analisis', reportes: '/analisis/reportes', 'ventas-dia': '/analisis/ventas-dia',
  ganancias: '/analisis/ganancias', ganadores: '/analisis/ganadores',
  plantillas: '/plantillas',
  // Módulos
  cotizador: '/trade-in', 'tradein-admin': '/trade-in',
  servicio: '/servicio', garantias: '/garantias', taller: '/stock/taller',
  repartos: '/delivery',
  campanas: '/campanas',
  publicidad: '/finanzas/publicidad',
  comisiones: '/finanzas/comisiones',
  creditos: '/finanzas/creditos', cuotas: '/finanzas/cuotas',
  conciliacion: '/finanzas/conciliacion',
  promociones: '/promociones',
  precios: '/precios',
  celulares: '/celulares', comparador: '/comparador', 'centro-control': '/centro-control',
  abastecimiento: '/abastecimiento', 'compras-centro': '/compras-centro', preparacion: '/preparacion', lotes: '/preparar-lote', recepcion: '/recepcion', metricas: '/metricas',
  traslados: '/stock/traslados', transito: '/stock/transito', compartido: '/stock/compartido', ubicaciones: '/stock/ubicaciones',
  conteos: '/stock/conteos', verificacion: '/stock/verificacion', reservas: '/stock/reservas',
  ops: '/ops',
  asistente: '/analisis/asistente',
}
