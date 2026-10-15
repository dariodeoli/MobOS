import test from 'node:test'
import assert from 'node:assert/strict'
import { clienteNativo, compararVersiones, fijarVersionNativa, isNativeIOS, plataforma, requiereActualizar, versionApp } from './plataforma.js'

const ios = { getPlatform: () => 'ios', isNativePlatform: () => true }
const web = { getPlatform: () => 'web', isNativePlatform: () => false }
const android = { getPlatform: () => 'android', isNativePlatform: () => true }

test('isNativeIOS: solo dentro del contenedor de iPhone', () => {
  assert.equal(isNativeIOS(ios), true)
  assert.equal(isNativeIOS(web), false)
  assert.equal(isNativeIOS(android), false)
  assert.equal(isNativeIOS({ getPlatform: () => 'ios', isNativePlatform: () => false }), false)
})

test('isNativeIOS: un Capacitor roto no rompe la web', () => {
  assert.equal(isNativeIOS({ getPlatform() { throw new Error('boom') } }), false)
  assert.equal(isNativeIOS(null), false)
  assert.equal(plataforma({ getPlatform() { throw new Error('boom') } }), 'web')
})

test('en node (sin contenedor) la plataforma es web', () => {
  assert.equal(isNativeIOS(), false)
})

test('compararVersiones ordena versiones numéricas con segmentos faltantes', () => {
  assert.equal(compararVersiones('1.0.0', '1.0.0'), 0)
  assert.equal(compararVersiones('1.0', '1.0.0'), 0)
  assert.equal(compararVersiones('1.0.9', '1.0.10'), -1)
  assert.equal(compararVersiones('2.0', '1.9.9'), 1)
  assert.equal(compararVersiones('', '0.0.1'), -1)
})

test('requiereActualizar: bloquea solo si la mínima es mayor; sin mínima no bloquea', () => {
  assert.equal(requiereActualizar('1.0.0', '1.1.0'), true)
  assert.equal(requiereActualizar('1.1.0', '1.1.0'), false)
  assert.equal(requiereActualizar('1.2.0', '1.1.0'), false)
  assert.equal(requiereActualizar('1.0.0', ''), false)
  assert.equal(requiereActualizar('1.0.0', undefined), false)
})

test('clienteNativo arma «ios/<versión>» y usa la versión nativa cuando se leyó', () => {
  assert.match(clienteNativo('1.4.2'), /^ios\/1\.4\.2$/)
  fijarVersionNativa('3.1')
  assert.equal(versionApp(), '3.1')
  assert.equal(clienteNativo(), 'ios/3.1')
  fijarVersionNativa('')
  assert.equal(versionApp(), '3.1')
})

test('moduloDisponible: web todo; iOS v1 solo Vender, Pedidos, Clientes y Configuración', async () => {
  const { moduloDisponible } = await import('./plataforma.js')
  assert.equal(moduloDisponible('finanzas', { ios: false }), true)
  for (const id of ['cargar', 'pedidos', 'clientes', 'equipo', 'mi-cuenta']) assert.equal(moduloDisponible(id, { ios: true, todos: false }), true)
  for (const id of ['inventario', 'productos', 'compras', 'servicio', 'finanzas', 'analisis', 'resumen']) assert.equal(moduloDisponible(id, { ios: true, todos: false }), false)
  assert.equal(moduloDisponible('finanzas', { ios: true, todos: true }), true)
})
