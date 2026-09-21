// Lectura de planillas para la importación de productos. Acepta CSV/TSV (el
// parser compartido de src/utils/csv.js) y .xlsx (read-excel-file, cargado
// solo cuando hace falta). El frontend no interpreta números ni precios: eso
// lo valida el backend fila por fila, así la vista previa y la escritura usan
// exactamente la misma regla.

import { parseDelimited } from './csv.js'

export const MAX_FILAS_IMPORTACION = 500
export const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024

// Columnas reconocidas y sus alias (se comparan sin acentos ni mayúsculas).
// `sku` es la única obligatoria; el resto enriquece la ficha.
export const COLUMNAS_IMPORTACION = [
  { clave: 'sku', etiqueta: 'SKU', requerida: true, ayuda: 'Código único por sucursal.' },
  { clave: 'name', etiqueta: 'Nombre', ayuda: 'Nombre del producto.' },
  { clave: 'pricePyg', etiqueta: 'Precio', ayuda: 'Precio de lista en guaraníes.' },
  { clave: 'stock', etiqueta: 'Stock', ayuda: 'Stock inicial (productos nuevos).' },
  { clave: 'category', etiqueta: 'Categoría', ayuda: 'Celulares, Accesorios, etc.' },
  { clave: 'condition', etiqueta: 'Condición', ayuda: 'Nuevo, Semi o Reacondicionado.' },
  { clave: 'costPyg', etiqueta: 'Costo', ayuda: 'Costo en guaraníes (opcional).' },
  { clave: 'wholesalePricePyg', etiqueta: 'Mayorista', ayuda: 'Precio mayorista (opcional).' },
  { clave: 'priceUsd', etiqueta: 'USD', ayuda: 'Precio en dólares (opcional).' },
  { clave: 'model', etiqueta: 'Modelo', ayuda: 'Modelo estructurado (opcional).' },
  { clave: 'color', etiqueta: 'Color', ayuda: 'Color (opcional).' },
  { clave: 'capacity', etiqueta: 'Capacidad', ayuda: 'Ej. 128GB (opcional).' },
  { clave: 'warrantyDays', etiqueta: 'Garantía', ayuda: 'Días de garantía (0–730).' },
]

const ALIAS = {
  sku: ['sku', 'codigo', 'cod', 'codigo de barras', 'codigo barras', 'barcode', 'codigo interno'],
  name: ['nombre', 'producto', 'name', 'articulo', 'descripcion', 'detalle'],
  pricePyg: ['precio', 'precio venta', 'precio de venta', 'precio pyg', 'precio lista', 'pvp', 'price'],
  stock: ['stock', 'cantidad', 'cant', 'existencias', 'qty'],
  category: ['categoria', 'rubro', 'category'],
  condition: ['condicion', 'estado', 'condition'],
  costPyg: ['costo', 'cost', 'precio costo', 'precio de costo', 'costo pyg'],
  wholesalePricePyg: ['mayorista', 'precio mayorista', 'precio mayorista pyg', 'wholesale'],
  priceUsd: ['usd', 'precio usd', 'precio dolar', 'precio en dolares', 'dolar'],
  model: ['modelo', 'model'],
  color: ['color'],
  capacity: ['capacidad', 'memoria', 'capacity'],
  warrantyDays: ['garantia', 'garantia dias', 'dias de garantia', 'dias garantia', 'warranty'],
}

const EXTENSIONES_XLSX = ['xlsx', 'xlsm']
const TIPOS_XLSX = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroenabled.12']

export const ACEPTA_IMPORTACION = '.csv,.tsv,.txt,.xlsx,.xlsm,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroenabled.12'

export function extensionDe(nombre) {
  const partes = String(nombre || '').toLowerCase().split('.')
  return partes.length > 1 ? partes.pop() : ''
}

export function esXlsx(archivo) {
  const tipo = String(archivo?.type || '').toLowerCase()
  return EXTENSIONES_XLSX.includes(extensionDe(archivo?.name)) || TIPOS_XLSX.includes(tipo)
}

// Encabezados tolerantes: "Precio_Venta", "PRECIO DE VENTA" y "precio venta"
// son la misma columna.
export function normalizarEncabezado(valor) {
  return String(valor ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function indiceDeColumnas(encabezados) {
  const indices = {}
  const desconocidos = []
  encabezados.forEach((celda, posicion) => {
    const normalizado = normalizarEncabezado(celda)
    if (!normalizado) return
    const clave = Object.keys(ALIAS).find(candidata => ALIAS[candidata].includes(normalizado))
    if (!clave) {
      if (!desconocidos.includes(String(celda).trim())) desconocidos.push(String(celda).trim())
      return
    }
    if (indices[clave] === undefined) indices[clave] = posicion
  })
  return { indices, desconocidos }
}

function celdaImportada(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'string') return valor.trim()
  return valor
}

// Convierte la matriz cruda (CSV o XLSX) en filas con claves canónicas.
// Devuelve también qué encabezados se reconocieron: la vista los muestra.
export function filasDesdeMatriz(matriz) {
  const filas = Array.isArray(matriz) ? matriz : []
  const primera = filas.findIndex(fila => Array.isArray(fila) && fila.some(celda => String(celda ?? '').trim() !== ''))
  if (primera < 0) return { filas: [], descartadas: 0, indices: {}, desconocidos: [], faltantes: COLUMNAS_IMPORTACION.filter(columna => columna.requerida).map(columna => columna.clave), encabezado: [] }
  const encabezado = filas[primera].map(celda => String(celda ?? '').trim())
  const { indices, desconocidos } = indiceDeColumnas(encabezado)
  const faltantes = COLUMNAS_IMPORTACION.filter(columna => columna.requerida && indices[columna.clave] === undefined).map(columna => columna.clave)
  const resultado = []
  let descartadas = 0
  for (const fila of filas.slice(primera + 1)) {
    if (!Array.isArray(fila) || !fila.some(celda => String(celda ?? '').trim() !== '')) { descartadas += 1; continue }
    const item = {}
    for (const clave of Object.keys(indices)) item[clave] = celdaImportada(fila[indices[clave]])
    resultado.push(item)
  }
  return { filas: resultado, descartadas, indices, desconocidos, faltantes, encabezado }
}

/** Lee el archivo elegido y devuelve la matriz cruda de celdas (primera hoja). */
export async function leerArchivoProductos(archivo) {
  if (esXlsx(archivo)) {
    // `readSheet` devuelve la matriz de la primera hoja; el export por defecto
    // de la librería lista todas las hojas y no es lo que necesita el importador.
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(archivo)
  }
  return parseDelimited(await archivo.text())
}

export function validarArchivoProductos(archivo) {
  if (!archivo) return 'Elegí un archivo.'
  if (archivo.size > MAX_ARCHIVO_BYTES) return `El archivo supera los ${Math.round(MAX_ARCHIVO_BYTES / 1024 / 1024)} MiB.`
  const extension = extensionDe(archivo.name)
  const tipo = String(archivo.type || '').toLowerCase()
  const valido = esXlsx(archivo) || ['csv', 'tsv', 'txt'].includes(extension) || tipo === 'text/csv' || tipo === 'text/tab-separated-values' || tipo === 'text/plain'
  if (!valido) return 'Formato no soportado: usá .csv, .tsv o .xlsx.'
  return ''
}
