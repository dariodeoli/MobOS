// Parser mínimo de archivos delimitados (CSV/TSV) con comillas escapadas,
// para importar fichas de clientes desde export de otros sistemas.

export function detectarDelimitador(texto) {
  const primera = (texto || '').split(/\r?\n/, 1)[0] || ''
  const tabulaciones = (primera.match(/\t/g) || []).length
  const comas = (primera.match(/,/g) || []).length
  const puntoYComa = (primera.match(/;/g) || []).length
  if (tabulaciones >= comas && tabulaciones >= puntoYComa && tabulaciones > 0) return '\t'
  if (puntoYComa > comas && puntoYComa > 0) return ';'
  return ','
}

export function parseDelimited(texto) {
  const delimitador = detectarDelimitador(texto)
  const filas = []
  let fila = []
  let campo = ''
  let entreComillas = false
  const fuente = String(texto || '')
  for (let i = 0; i < fuente.length; i += 1) {
    const caracter = fuente[i]
    if (entreComillas) {
      if (caracter === '"') {
        if (fuente[i + 1] === '"') { campo += '"'; i += 1 } else { entreComillas = false }
      } else { campo += caracter }
      continue
    }
    if (caracter === '"') { entreComillas = true; continue }
    if (caracter === delimitador) { fila.push(campo); campo = ''; continue }
    if (caracter === '\n' || caracter === '\r') {
      if (caracter === '\r' && fuente[i + 1] === '\n') i += 1
      fila.push(campo)
      if (fila.some((celda) => celda.trim() !== '')) filas.push(fila)
      fila = []; campo = ''
      continue
    }
    campo += caracter
  }
  fila.push(campo)
  if (fila.some((celda) => celda.trim() !== '')) filas.push(fila)
  return filas
}

// Convierte filas con encabezado tipo Shopify en un mapa por fila.
export function filasConEncabezado(filas) {
  if (!Array.isArray(filas) || filas.length < 2) return []
  const encabezados = (filas[0] || []).map((celda) => String(celda).trim())
  return filas.slice(1).map((fila) => Object.fromEntries(encabezados.map((clave, indice) => [clave, String(fila[indice] ?? '').trim()])))
}
