// Utilidades puras del reporte de MobOS. Sin React ni red, para poder probarlas
// con node:test (ver reportes.test.js).

export const GRUPOS = [
  { id: 'product', label: 'Producto', plural: 'Por producto' },
  { id: 'category', label: 'Categoría', plural: 'Por categoría' },
  { id: 'seller', label: 'Vendedor', plural: 'Por vendedor' },
  { id: 'day', label: 'Día', plural: 'Por día' },
]

/** Producto y categoría se calculan por línea; día y vendedor, por orden. */
export const GRUPOS_POR_LINEA = ['product', 'category']

export function esGrupoPorLinea(groupBy) {
  return GRUPOS_POR_LINEA.includes(groupBy)
}

export function etiquetaGrupo(groupBy) {
  return GRUPOS.find((g) => g.id === groupBy)?.label || 'Producto'
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export function esFechaSimple(valor) {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor)) return false
  const [y, m, d] = valor.split('-').map(Number)
  const prueba = new Date(Date.UTC(y, m - 1, d))
  return prueba.getUTCFullYear() === y && prueba.getUTCMonth() === m - 1 && prueba.getUTCDate() === d
}

export function rangoValido(desde, hasta) {
  if (!esFechaSimple(desde) || !esFechaSimple(hasta)) return false
  return desde <= hasta
}

// Una celda que empieza con =, +, -, @, tabulación o retorno puede ejecutarse
// como fórmula al abrir el CSV en una planilla. Se neutraliza con un apóstrofo.
export function celdaSegura(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
}

export function celdaCsv(valor) {
  const texto = celdaSegura(valor)
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function filasCsv(encabezados, filas) {
  return [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(',')).join('\r\n')
}

export function columnasReporte(groupBy) {
  const primera = { key: 'label', label: etiquetaGrupo(groupBy), tipo: 'texto' }
  if (esGrupoPorLinea(groupBy)) {
    return [
      primera,
      { key: 'orders', label: 'Ventas', tipo: 'numero' },
      { key: 'units', label: 'Unidades', tipo: 'numero' },
      { key: 'grossPyg', label: 'Venta', tipo: 'monto' },
      { key: 'costPyg', label: 'Costo', tipo: 'monto' },
      { key: 'profitPyg', label: 'Ganancia', tipo: 'monto' },
      { key: 'salesWithoutCostPyg', label: 'Sin costo', tipo: 'monto' },
      { key: 'linesWithoutCost', label: 'Líneas sin costo', tipo: 'numero' },
    ]
  }
  return [
    primera,
    { key: 'orders', label: 'Ventas', tipo: 'numero' },
    { key: 'units', label: 'Unidades', tipo: 'numero' },
    { key: 'totalPyg', label: 'Total', tipo: 'monto' },
    { key: 'collectedPyg', label: 'Cobrado', tipo: 'monto' },
    { key: 'pendingPyg', label: 'Saldo', tipo: 'monto' },
    { key: 'costPyg', label: 'Costo', tipo: 'monto' },
    { key: 'profitPyg', label: 'Ganancia', tipo: 'monto' },
    { key: 'salesWithoutCostPyg', label: 'Sin costo', tipo: 'monto' },
  ]
}

/** Arma encabezados y filas listos para exportar desde la respuesta de la API. */
export function filasReporte(reporte, groupBy) {
  const columnas = columnasReporte(groupBy)
  const grupos = Array.isArray(reporte?.groups) ? reporte.groups : []
  return {
    encabezados: columnas.map((c) => c.label),
    filas: grupos.map((grupo) => columnas.map((columna) => {
      const valor = grupo?.[columna.key]
      return valor === null || valor === undefined ? '' : valor
    })),
    columnas,
  }
}

export function nombreArchivoCsv({ desde, hasta, groupBy }) {
  const sufijo = (groupBy || 'product').replace(/[^a-z]/gi, '')
  return `mobos-reporte-${sufijo}-${desde || 'inicio'}-a-${hasta || 'hoy'}.csv`
}
