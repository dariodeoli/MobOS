import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOGO_APPLE, FAMILIAS_APPLE, buscarModelosApple, capacidadValida, capacidadesDeModelo, coloresDeModelo, modeloApple, normalizarCapacidad,
} from '../../backend/lib/catalogo-apple.mjs'

test('el catálogo cubre todas las familias Apple y los ids son únicos', () => {
  for (const familia of FAMILIAS_APPLE) assert.ok(CATALOGO_APPLE.some(item => item.familia === familia), familia)
  assert.equal(new Set(CATALOGO_APPLE.map(item => item.id)).size, CATALOGO_APPLE.length)
})

test('los iPhone van del 11 al último y todos tienen capacidades y colores', () => {
  const iphones = CATALOGO_APPLE.filter(item => item.familia === 'iPhone')
  for (const nombre of ['iPhone 11', 'iPhone 12 mini', 'iPhone 13 Pro Max', 'iPhone 14 Plus', 'iPhone 15 Pro Max', 'iPhone 16e', 'iPhone 17 Pro Max', 'iPhone Air']) assert.ok(modeloApple(nombre), nombre)
  for (const item of iphones) { assert.ok(item.capacidades.length > 0, item.nombre); assert.ok(item.colores.length > 0, item.nombre) }
  assert.equal(modeloApple('iphone 10'), null)
})

test('las capacidades y los colores salen del modelo', () => {
  assert.deepEqual(capacidadesDeModelo('iPhone 15 Pro Max'), ['256GB', '512GB', '1TB'])
  assert.ok(capacidadesDeModelo('iPhone 15 Pro').includes('128GB'))
  assert.ok(coloresDeModelo('iPhone 15 Pro Max').includes('Titanio natural'))
  assert.deepEqual(capacidadesDeModelo('AirPods Pro 2'), [])
  assert.deepEqual(capacidadesDeModelo('Modelo inexistente'), [])
})

test('buscar «15 pro max» encuentra solo ese modelo, sin importar el orden ni los acentos', () => {
  assert.deepEqual(buscarModelosApple('15 pro max').map(item => item.nombre), ['iPhone 15 Pro Max'])
  assert.deepEqual(buscarModelosApple('MAX PRO 15').map(item => item.nombre), ['iPhone 15 Pro Max'])
  const quince = buscarModelosApple('iphone 15').map(item => item.nombre)
  assert.deepEqual(quince.slice(0, 1), ['iPhone 15'])
  assert.ok(quince.includes('iPhone 15 Pro Max') && quince.includes('iPhone 15 Plus'))
  assert.ok(buscarModelosApple('airpods pro').every(item => item.familia === 'AirPods'))
  assert.deepEqual(buscarModelosApple(''), [])
  assert.deepEqual(buscarModelosApple('zzz'), [])
})

test('valida y normaliza la capacidad contra el modelo', () => {
  assert.equal(normalizarCapacidad('256 gb'), '256GB')
  assert.equal(normalizarCapacidad('1 tb'), '1TB')
  assert.equal(capacidadValida('iPhone 15 Pro Max', '256 GB'), true)
  assert.equal(capacidadValida('iPhone 15 Pro Max', '128GB'), false)
  assert.equal(capacidadValida('AirPods Pro 2', ''), true)
  assert.equal(capacidadValida('Samsung Galaxy S23', '256GB'), true, 'un modelo fuera del catálogo no se rechaza')
})
