import assert from 'node:assert/strict'
import test from 'node:test'
import { extensionDe, esXlsx, filasDesdeMatriz, leerArchivoProductos, normalizarEncabezado, validarArchivoProductos } from './importarProductos.js'

test('normaliza encabezados con acentos, mayúsculas y separadores', () => {
  assert.equal(normalizarEncabezado('\uFEFFCódigo'), 'codigo')
  assert.equal(normalizarEncabezado('Precio_Venta'), 'precio venta')
  assert.equal(normalizarEncabezado('  PRECIO   DE VENTA '), 'precio de venta')
  assert.equal(normalizarEncabezado('Precio-venta'), 'precio venta')
})

test('mapea columnas en cualquier orden y reconoce alias', () => {
  const { filas, descartadas, faltantes, desconocidos } = filasDesdeMatriz([
    ['Código', 'Producto', 'Precio Venta', 'Cantidad', 'Condición', 'Observación'],
    ['A-1', 'Cable USB', '1.500.000', '3', 'Semi', 'nota libre'],
    ['', '', '', '', '', ''],
    ['A-2', 'Funda', 25000, 0, 'Nuevo', ''],
  ])
  assert.deepEqual(faltantes, [])
  assert.deepEqual(desconocidos, ['Observación'])
  assert.equal(descartadas, 1)
  assert.deepEqual(filas, [
    { sku: 'A-1', name: 'Cable USB', pricePyg: '1.500.000', stock: '3', condition: 'Semi' },
    { sku: 'A-2', name: 'Funda', pricePyg: 25000, stock: 0, condition: 'Nuevo' },
  ])
})

test('exige la columna SKU y saltea filas vacías del encabezado', () => {
  const sinSku = filasDesdeMatriz([['Nombre', 'Precio'], ['Cable', 1000]])
  assert.deepEqual(sinSku.faltantes, ['sku'])
  assert.equal(sinSku.filas.length, 1)
  const conBlanco = filasDesdeMatriz([[''], [], ['Nombre', 'SKU'], ['Cable', 'C-1']])
  assert.deepEqual(conBlanco.faltantes, [])
  assert.deepEqual(conBlanco.filas, [{ name: 'Cable', sku: 'C-1' }])
})

test('las celdas de fecha se leen como YYYY-MM-DD y las vacías como texto vacío', () => {
  const { filas } = filasDesdeMatriz([
    ['SKU', 'Nombre'],
    ['A-1', new Date('2026-09-03T12:00:00Z')],
  ])
  assert.deepEqual(filas, [{ sku: 'A-1', name: '2026-09-03' }])
})

test('valida tamaño, extensión y tipo del archivo', () => {
  assert.equal(validarArchivoProductos(null), 'Elegí un archivo.')
  assert.match(validarArchivoProductos({ name: 'x.pdf', size: 10, type: 'application/pdf' }), /Formato no soportado/)
  assert.equal(validarArchivoProductos({ name: 'x.xlsx', size: 10, type: '' }), '')
  assert.equal(validarArchivoProductos({ name: 'x.csv', size: 10, type: 'text/csv' }), '')
  assert.match(validarArchivoProductos({ name: 'x.csv', size: 6 * 1024 * 1024, type: 'text/csv' }), /supera los 5 MiB/)
  assert.equal(extensionDe('Productos.XLSX'), 'xlsx')
  assert.equal(esXlsx({ name: 'lista.xlsm', type: '' }), true)
  assert.equal(esXlsx({ name: 'lista.csv', type: 'text/csv' }), false)
})

test('lee CSV con el parser compartido (y no interpreta los números)', async () => {
  const archivo = new File(['sku;nombre;precio\nA-1;Cable;1.500.000\n'], 'productos.csv', { type: 'text/csv' })
  const matriz = await leerArchivoProductos(archivo)
  const { filas, faltantes } = filasDesdeMatriz(matriz)
  assert.deepEqual(faltantes, [])
  assert.deepEqual(filas, [{ sku: 'A-1', name: 'Cable', pricePyg: '1.500.000' }])
})
