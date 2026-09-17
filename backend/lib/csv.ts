// Utilidades de exportación CSV del backend: separador punto y coma para que
// Excel en español abra las columnas de una, BOM UTF-8 para respetar acentos y
// comillas dobles escapadas cuando la celda trae punto y coma o saltos.

// Una celda que empieza con =, +, -, @, tabulación o retorno puede ejecutarse
// como fórmula al abrir el archivo en una planilla. Se neutraliza con apóstrofo,
// igual que el helper del cliente (src/utils/reportes.js).
const FORMULA = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  const texto = value === null || value === undefined ? '' : String(value)
  const seguro = FORMULA.test(texto) ? `'${texto}` : texto
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export function csvBody(encabezados: string[], filas: Array<Array<unknown>>): string {
  return [encabezados, ...filas].map((fila) => fila.map(csvCell).join(';')).join('\r\n')
}

/** Respuesta HTTP lista para descargar: BOM, charset explícito y nombre de archivo. */
export function csvResponse(encabezados: string[], filas: Array<Array<unknown>>, nombreArchivo: string): Response {
  return new Response(`\uFEFF${csvBody(encabezados, filas)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
