// Qué pasa cuando alguien abre una ruta de un módulo apagado: vuelve a la vista
// padre y ve «El módulo X está desactivado». Puro: lo usan el panel y los tests.
import { moduloDef, moduloDeVista } from './modulos.js'

// Vista (o pestaña) del módulo → ruta padre a la que se vuelve.
const PADRE_POR_VISTA = {
  cotizador: '/pos',
  'tradein-admin': '/pos',
  servicio: '/resumen',
  garantias: '/resumen',
  taller: '/stock/unidades',
  repartos: '/pedidos',
  campanas: '/clientes',
  promociones: '/clientes',
  precios: '/stock/unidades',
  celulares: '/stock/unidades',
  comparador: '/stock/unidades',
  'centro-control': '/stock/unidades',
  abastecimiento: '/compras',
  'compras-centro': '/compras',
  preparacion: '/compras',
  lotes: '/compras',
  recepcion: '/compras',
  metricas: '/compras',
  traslados: '/stock/unidades',
  transito: '/stock/unidades',
  compartido: '/stock/unidades',
  ubicaciones: '/stock/unidades',
  conteos: '/stock/unidades',
  verificacion: '/stock/unidades',
  reservas: '/stock/unidades',
  conciliacion: '/finanzas/caja',
  creditos: '/finanzas/caja',
  cuotas: '/finanzas/caja',
  comisiones: '/finanzas/caja',
  publicidad: '/finanzas/caja',
  asistente: '/analisis/reportes',
  ops: '/resumen',
}

/** Ruta padre de una vista o pestaña de módulo ('/resumen' si no hay una definida). */
export function rutaPadreDeVista(id) {
  return PADRE_POR_VISTA[id] || '/resumen'
}

export function nombreDeModulo(id) {
  return moduloDef(id)?.name || id
}

export const textoModuloDesactivado = id => `El módulo ${nombreDeModulo(id)} está desactivado.`

/** Texto del aviso para el módulo que controla `idDeVista` (null si es del núcleo). */
export function avisoModuloApagado(idDeVista) {
  const modulo = moduloDeVista(idDeVista)
  return modulo ? textoModuloDesactivado(modulo) : null
}
