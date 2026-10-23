import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cambiosDeGrilla, csvPlantilla, csvValores, filasGrilla, filasQueCambian, leerCsvValores, rangosPorCapacidad, textoRango } from './valoresToma.js'
import { guardarLoteValuacionesDemo, listarValuacionesDemo } from './demo/valuaciones.js'
import { CATALOGO_APPLE } from '../../backend/lib/catalogo-apple.mjs'

const VALORES = [
  { id: 'a', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '256GB', condition: 'USED', baseValuePyg: 5600000, maxValuePyg: 6200000, isActive: true },
  { id: 'b', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '512GB', condition: 'USED', baseValuePyg: 6400000, maxValuePyg: null, isActive: true },
  { id: 'c', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '256GB', condition: 'NEW', baseValuePyg: 8000000, maxValuePyg: 8600000, isActive: true },
  { id: 'd', model: 'iPhone 15 Pro Max', modelKey: 'iphone 15 pro max', storage: '1TB', condition: 'USED', baseValuePyg: 7000000, maxValuePyg: null, isActive: false },
]

test('cotizador: «15 pro max» → capacidades del modelo con su rango por condición', () => {
  const rangos = rangosPorCapacidad(VALORES, 'iPhone 15 Pro Max')
  assert.deepEqual(rangos.map((fila) => fila.storage), ['256GB', '512GB', '1TB'])
  assert.deepEqual(rangos[0].condiciones.USED, { base: 5600000, max: 6200000 })
  assert.deepEqual(rangos[0].condiciones.NEW, { base: 8000000, max: 8600000 })
  assert.deepEqual(rangos[1].condiciones.USED, { base: 6400000, max: null })
  assert.deepEqual(rangos[2].condiciones, {}, 'un valor inactivo no aparece')
  const formato = (n) => `Gs ${n.toLocaleString('es-PY')}`
  assert.equal(textoRango(rangos[0].condiciones.USED, formato), 'Gs 5.600.000 – Gs 6.200.000')
  assert.equal(textoRango(rangos[1].condiciones.USED, formato), 'Gs 6.400.000')
  assert.equal(textoRango(undefined, formato), '')
})

test('la grilla trae una fila por modelo y capacidad con el valor que ya existe', () => {
  const filas = filasGrilla(VALORES, { condicion: 'USED', familia: 'iPhone', texto: '15 pro max' })
  assert.deepEqual(filas.map((fila) => fila.storage), ['256GB', '512GB', '1TB'])
  assert.equal(filas[0].base, '5600000')
  assert.equal(filas[0].max, '6200000')
  assert.equal(filas[2].actual.id, 'd')
  assert.equal(filasGrilla([], { condicion: 'USED', familia: 'iPhone' }).length, CATALOGO_APPLE.filter((m) => m.familia === 'iPhone').reduce((suma, m) => suma + m.capacidades.length, 0))
  assert.equal(filasGrilla(VALORES, { texto: 'zzz' }).length, 0)
})

test('edición masiva: solo viajan las celdas que cambian; vaciar el base desactiva', () => {
  const filas = filasGrilla(VALORES, { condicion: 'USED', texto: '15 pro max' })
  const ediciones = {
    [filas[0].clave]: { base: '5700000', max: '6200000' }, // cambia el base
    [filas[1].clave]: { base: '6400000', max: '' }, // igual: no viaja
    [filas[2].clave]: { base: '', max: '' }, // sin valor activo previo (d está inactivo): no viaja
  }
  const { rows, errores } = cambiosDeGrilla(filas, ediciones)
  assert.deepEqual(errores, [])
  assert.deepEqual(rows, [{ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', baseValuePyg: 5700000, maxValuePyg: 6200000, isActive: true }])
  const vaciar = cambiosDeGrilla(filas, { [filas[0].clave]: { base: '', max: '' } })
  assert.deepEqual(vaciar.rows, [{ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', baseValuePyg: 5600000, maxValuePyg: 6200000, isActive: false }])
  const nuevo = cambiosDeGrilla(filas, { [filas[2].clave]: { base: '7100000', max: '7500000' } })
  assert.equal(nuevo.rows[0].isActive, true, 'cargar un valor sobre uno inactivo lo reactiva')
})

test('edición masiva: valida montos y máximo contra base', () => {
  const filas = filasGrilla([], { condicion: 'USED', texto: 'iphone 11' }).slice(0, 2)
  const { rows, errores } = cambiosDeGrilla(filas, { [filas[0].clave]: { base: 'abc', max: '' }, [filas[1].clave]: { base: '1000000', max: '900000' } })
  assert.equal(rows.length, 0)
  assert.equal(errores.length, 2)
  assert.match(errores[0], /valor base/)
  assert.match(errores[1], /máximo/)
})

test('CSV: exporta con montos completos y vuelve a leerse igual', () => {
  const csv = csvValores(VALORES)
  assert.match(csv, /^"Modelo","Capacidad","Condición","Valor base","Valor máximo","Activo"/)
  assert.match(csv, /"iPhone 15 Pro Max","256GB","Seminuevo","5600000","6200000","Sí"/)
  assert.match(csv, /"1TB","Seminuevo","7000000","","No"/)
  const leido = leerCsvValores(csv)
  assert.deepEqual(leido.errores, [])
  assert.equal(leido.rows.length, 4)
  assert.deepEqual(filasQueCambian(leido.rows, VALORES), [], 'exportar y volver a importar no cambia nada')
})

test('CSV: acepta punto y coma, montos con puntos y condiciones en español; reporta cada error por línea', () => {
  const texto = ['Modelo;Capacidad;Condición;Valor base;Valor máximo', 'iphone 15 pro max;256 gb;nuevo;Gs 8.100.000;8.700.000', 'iPhone 15 Pro Max;128GB;Seminuevo;1000000;', 'iPhone 15 Pro Max;512GB;Roto;1000000;', 'iPhone 15 Pro Max;1TB;Seminuevo;abc;', 'iPhone 15 Pro Max;1TB;Usado;;', 'iPhone 15 Pro Max;512GB;Seminuevo;900000;800000'].join('\n')
  const { rows, errores, omitidas } = leerCsvValores(texto)
  assert.deepEqual(rows, [{ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'NEW', baseValuePyg: 8100000, maxValuePyg: 8700000, isActive: true }])
  assert.equal(omitidas, 1)
  assert.equal(errores.length, 4)
  assert.match(errores[0], /Línea 3: iPhone 15 Pro Max no viene en 128GB/)
  assert.match(errores[1], /Línea 4: condición/)
  assert.match(errores[2], /Línea 5: el valor base/)
  assert.match(errores[3], /Línea 7: el valor máximo/)
})

test('CSV: sin las columnas mínimas o repetido no se importa', () => {
  assert.match(leerCsvValores('Nombre,Precio\nx,1').errores[0], /Modelo.*Valor base/)
  assert.match(leerCsvValores('').errores[0], /no tiene filas/)
  const repetido = leerCsvValores('Modelo,Capacidad,Condición,Valor base\niPhone 13,128GB,Usado,1\niPhone 13,128GB,Seminuevo,2')
  assert.equal(repetido.rows.length, 1)
  assert.match(repetido.errores[0], /repetido/)
  assert.ok(csvPlantilla().split('\r\n').length > 50)
})

test('demo: valores completos del catálogo y lote idempotente', () => {
  const todos = listarValuacionesDemo()
  const modelos = new Set(todos.map((fila) => fila.model))
  for (const modelo of CATALOGO_APPLE) assert.ok(modelos.has(modelo.nombre), `${modelo.nombre} sin valores en la demo`)
  const capacidades = rangosPorCapacidad(todos, 'iPhone 15 Pro Max')
  assert.deepEqual(capacidades.map((fila) => fila.storage), ['256GB', '512GB', '1TB'])
  for (const fila of capacidades) for (const condicion of ['USED', 'NEW', 'REFURBISHED']) assert.ok(fila.condiciones[condicion].base > 0)
  assert.ok(capacidades[0].condiciones.USED.base < capacidades[1].condiciones.USED.base, 'más capacidad vale más')
  const lote = [{ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'USED', baseValuePyg: 5650000, maxValuePyg: 6250000, isActive: true }]
  assert.deepEqual([guardarLoteValuacionesDemo(lote).updated, guardarLoteValuacionesDemo(lote).unchanged], [1, 1])
})
