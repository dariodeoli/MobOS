import { api } from './api/client'
import { normalizarMetricas } from './metricasNucleo.js'

// Adaptador único de métricas (#171, fase 2 de #145).
//
// Una sola puerta al backend de métricas para la vista ejecutiva (Resumen) y la
// extendida (Análisis): `/api/reports` es la fuente canónica y el resumen
// liviano de conciliación viaja en la misma composición. Las pantallas no
// vuelven a armar consultas ni fórmulas: piden `metricasEjecutivas` o
// `reporteMetricas` y reciben un contrato estable.

// Paraguay quedó en UTC-3 fijo: el día de negocio es el mismo para todos.
export const TZ_METRICAS = -180

function parametrosReporte({ rango, branchId, groupBy = 'product', paymentsBy, type } = {}) {
  const params = new URLSearchParams({ from: rango?.desde || '', to: rango?.hasta || '', tzOffset: String(TZ_METRICAS), groupBy })
  if (paymentsBy) params.set('paymentsBy', paymentsBy)
  if (type) params.set('type', type)
  if (branchId) params.set('branchId', branchId)
  return params
}

/** Un reporte crudo de `/api/reports` (totales, grupos, inventario y previo). */
export function reporteMetricas({ rango, branchId, groupBy = 'product', paymentsBy, type } = {}) {
  return api.get(`/api/reports?${parametrosReporte({ rango, branchId, groupBy, paymentsBy, type })}`)
}

/** Resumen liviano de conciliación (sin el detalle pago por pago). */
export function conciliacionResumen({ rango, branchId } = {}) {
  const params = new URLSearchParams({ from: rango?.desde || '', to: rango?.hasta || '', soloResumen: '1' })
  if (branchId) params.set('branchId', branchId)
  return api.get(`/api/finance/reconciliation?${params}`)
}

/**
 * Métricas de la portada ejecutiva: totales y serie del período, top productos
 * con curva ABC, valor/rotación de stock, cobros por procesadora y cuenta, y
 * diferencias de conciliación. Cinco consultas en paralelo que el adaptador
 * normaliza a un solo objeto.
 */
export async function metricasEjecutivas({ rango, branchId } = {}) {
  const [dia, productos, procesadoras, cuentas, conciliacion] = await Promise.all([
    reporteMetricas({ rango, branchId, groupBy: 'day' }),
    reporteMetricas({ rango, branchId, groupBy: 'product' }),
    reporteMetricas({ rango, branchId, groupBy: 'payments', paymentsBy: 'processor' }),
    reporteMetricas({ rango, branchId, groupBy: 'payments', paymentsBy: 'account' }),
    conciliacionResumen({ rango, branchId }).catch(() => null),
  ])
  return normalizarMetricas({ dia, productos, procesadoras, cuentas, conciliacion })
}

export { normalizarMetricas }
