import { calcularGanancia, calcularGananciaDia, desdeDePeriodo, fechaClave, num } from './calculos.js'

// Cálculos de la subpágina Ganancias en un solo lugar (#181): los consumen la
// vista, el calendario compartido y Reportes. Sin datos del API se delega en
// las funciones locales de siempre (`calcularGanancia`/`calcularGananciaDia`),
// así los números no cambian; con API, ingresos y costo salen del reporte
// unificado y gastos/publicidad siguen viniendo de Finanzas.

export function estadoDeGanancia(ganancia) {
  return ganancia > 0 ? 'ganancia' : ganancia < 0 ? 'perdida' : 'empate'
}

/** Serie diaria lista para el calendario: totales, rango cubierto y por día. */
export function serieDeReporte(data) {
  return {
    totales: data?.totals || null,
    desde: data?.from || '',
    hasta: data?.to || '',
    porDia: new Map((Array.isArray(data?.groups) ? data.groups : []).map((grupo) => [grupo.key, grupo])),
  }
}

/** Resultado del período elegido (día/semana/mes/año). */
export function gananciaDelPeriodo(periodo, datos, totalesApi) {
  const local = calcularGanancia(periodo, datos)
  if (!totalesApi) return local
  const ingresos = num(totalesApi.totalPyg)
  const costoMercaderia = num(totalesApi.costPyg)
  const ganancia = ingresos - costoMercaderia - local.totalGastos - local.totalAds
  return {
    ...local,
    ingresos,
    costoMercaderia,
    ganancia,
    estado: estadoDeGanancia(ganancia),
    cantVentas: num(totalesApi.orders),
  }
}

/** Resultado de un día puntual; fuera del rango del reporte manda la caché. */
export function gananciaDelDia(clave, datos, serieApi) {
  const local = calcularGananciaDia(clave, datos)
  // Fuera del rango consultado (otro mes del calendario) manda la caché local:
  // el reporte solo cubre el período activo.
  if (!serieApi || !serieApi.desde || clave < serieApi.desde || clave > serieApi.hasta) return local
  const grupo = serieApi.porDia.get(clave)
  const ingresos = grupo ? num(grupo.totalPyg) : 0
  const costoMercaderia = grupo ? num(grupo.costPyg) : 0
  const ganancia = ingresos - costoMercaderia - local.totalGastos - local.totalAds
  const sinDatos = !grupo && local.totalGastos === 0 && local.totalAds === 0
  return {
    ...local,
    ingresos,
    costoMercaderia,
    ganancia,
    estado: sinDatos ? 'vacio' : estadoDeGanancia(ganancia),
    cantVentas: grupo ? num(grupo.orders) : 0,
  }
}

/**
 * Resultado de un rango arbitrario (la vista extendida usa rangos, no
 * períodos). Ingresos y costo salen del reporte; gastos y publicidad de
 * Finanzas, acotados al mismo rango. Devuelve null sin totales del API.
 */
export function gananciaDeRango(rango, datos, totalesApi) {
  if (!totalesApi) return null
  const desde = rango?.desde || ''
  const hasta = rango?.hasta || ''
  const enRango = (fila) => Boolean(fila?.fecha) && fila.fecha >= desde && fila.fecha <= hasta
  const totalGastos = (Array.isArray(datos?.gastos) ? datos.gastos : []).filter(enRango).reduce((suma, gasto) => suma + num(gasto.monto), 0)
  const totalAds = (Array.isArray(datos?.ads) ? datos.ads : []).filter(enRango).reduce((suma, ad) => suma + num(ad.monto), 0)
  const ingresos = num(totalesApi.totalPyg)
  const costoMercaderia = num(totalesApi.costPyg)
  const ganancia = ingresos - costoMercaderia - totalGastos - totalAds
  return { ingresos, costoMercaderia, totalGastos, totalAds, ganancia, estado: estadoDeGanancia(ganancia), cantVentas: num(totalesApi.orders) }
}

/** Filas del desglose "Cómo se calcula", con las etiquetas de siempre. */
export function lineasDeGanancia(ganancia, { costo = 'Costo de mercadería vendida' } = {}) {
  if (!ganancia) return []
  return [
    { label: 'Ingresos por ventas', valor: ganancia.ingresos, signo: '+', color: 'text-ok' },
    { label: costo, valor: ganancia.costoMercaderia, signo: '−', color: 'text-mute' },
    { label: 'Gastos', valor: ganancia.totalGastos, signo: '−', color: 'text-mute' },
    { label: 'Meta Ads', valor: ganancia.totalAds, signo: '−', color: 'text-mute' },
  ]
}

export { desdeDePeriodo, fechaClave }
