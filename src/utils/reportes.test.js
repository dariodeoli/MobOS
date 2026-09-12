import assert from 'node:assert/strict'
import test from 'node:test'
import {
  celdaCsv,
  celdaSegura,
  columnasReporte,
  esGrupoPorLinea,
  filasCsv,
  filasReporte,
  nombreArchivoCsv,
  rangoValido,
} from './reportes.js'

test('neutraliza fórmulas al exportar CSV', () => {
  assert.equal(celdaSegura('=SUM(A1:A9)'), "'=SUM(A1:A9)")
  assert.equal(celdaSegura('+595981123456'), "'+595981123456")
  assert.equal(celdaSegura('-1'), "'-1")
  assert.equal(celdaSegura('@import'), "'@import")
  assert.equal(celdaSegura('Case iPhone 15'), 'Case iPhone 15')
  assert.equal(celdaSegura(null), '')
})

test('escapa comillas, comas y saltos de línea', () => {
  assert.equal(celdaCsv('Case, negro'), '"Case, negro"')
  assert.equal(celdaCsv('Case "Pro"'), '"Case ""Pro"""')
  assert.equal(celdaCsv('linea1\nlinea2'), '"linea1\nlinea2"')
  assert.equal(celdaCsv(1500), '1500')
})

test('arma el CSV con encabezado y saltos CRLF', () => {
  const csv = filasCsv(['Producto', 'Venta'], [['Case, negro', 1500], ['Lámina', 500]])
  assert.equal(csv, 'Producto,Venta\r\n"Case, negro",1500\r\nLámina,500')
})

test('valida el rango de fechas', () => {
  assert.ok(rangoValido('2026-09-01', '2026-09-30'))
  assert.ok(rangoValido('2026-09-01', '2026-09-01'))
  assert.equal(rangoValido('2026-09-30', '2026-09-01'), false)
  assert.equal(rangoValido('2026-2-01', '2026-09-30'), false)
  assert.equal(rangoValido('2026-02-30', '2026-03-01'), false)
  assert.equal(rangoValido(null, '2026-03-01'), false)
})

test('producto y categoría se calculan por línea', () => {
  assert.ok(esGrupoPorLinea('product'))
  assert.ok(esGrupoPorLinea('category'))
  assert.equal(esGrupoPorLinea('day'), false)
  assert.equal(esGrupoPorLinea('seller'), false)
})

test('las columnas acompañan la agrupación elegida', () => {
  const linea = columnasReporte('product').map((c) => c.key)
  assert.deepEqual(linea, ['label', 'orders', 'units', 'grossPyg', 'costPyg', 'profitPyg', 'salesWithoutCostPyg', 'linesWithoutCost'])
  const orden = columnasReporte('seller').map((c) => c.key)
  assert.deepEqual(orden, ['label', 'orders', 'units', 'totalPyg', 'collectedPyg', 'pendingPyg', 'costPyg', 'profitPyg', 'salesWithoutCostPyg'])
  assert.equal(columnasReporte('day')[0].label, 'Día')
  assert.equal(columnasReporte('category')[0].label, 'Categoría')
})

test('convierte la respuesta de la API en filas exportables', () => {
  const { encabezados, filas } = filasReporte({
    groups: [
      { label: 'Case iPhone 15', orders: 3, units: 4, grossPyg: 600000, costPyg: 400000, profitPyg: 200000, salesWithoutCostPyg: 0, linesWithoutCost: 0 },
      { label: 'Sin costo', orders: 1, units: 1, grossPyg: 100000, costPyg: 0, profitPyg: 0, salesWithoutCostPyg: 100000, linesWithoutCost: 1 },
    ],
  }, 'product')
  assert.equal(encabezados[0], 'Producto')
  assert.equal(filas.length, 2)
  assert.equal(filas[0].length, encabezados.length)
  assert.equal(filas[0][3], 600000)
  assert.equal(filas[1][6], 100000)
  assert.deepEqual(filasReporte({}, 'seller').filas, [])
  assert.deepEqual(filasReporte(undefined, 'seller').filas, [])
})

test('el nombre del archivo describe el período y la agrupación', () => {
  assert.equal(nombreArchivoCsv({ desde: '2026-09-01', hasta: '2026-09-11', groupBy: 'day' }), 'mobos-reporte-day-2026-09-01-a-2026-09-11.csv')
  assert.equal(nombreArchivoCsv({ desde: '2026-09-01', hasta: '2026-09-11', groupBy: 'product' }), 'mobos-reporte-product-2026-09-01-a-2026-09-11.csv')
})
