// #240/#250: la etiqueta del buscador dependiente se vuelve a abrir para editar
// una orden y para que el tablero muestre el modelo separado de sus variantes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partesDispositivo, tipoDeDispositivo, varianteDispositivo } from './dispositivos.js'

test('la etiqueta del dispositivo se abre en modelo, capacidad y color', () => {
  assert.deepEqual(partesDispositivo('iPhone 15 Pro · 256 GB · Titanio azul'), { modelo: 'iPhone 15 Pro', capacidad: '256 GB', color: 'Titanio azul' })
  // Parcial: lo que falte queda vacío y el modelo no pierde espacios internos.
  assert.deepEqual(partesDispositivo('MacBook Air M2'), { modelo: 'MacBook Air M2', capacidad: '', color: '' })
  assert.deepEqual(partesDispositivo('iPhone 13 · 128 GB'), { modelo: 'iPhone 13', capacidad: '128 GB', color: '' })
  assert.deepEqual(partesDispositivo(''), { modelo: '', capacidad: '', color: '' })
  assert.deepEqual(partesDispositivo(null), { modelo: '', capacidad: '', color: '' })
  // El separador es el mismo que compone la biblioteca: lo que entra, sale.
  assert.deepEqual(partesDispositivo('AirPods Pro ·  · Blanco'), { modelo: 'AirPods Pro', capacidad: '', color: 'Blanco' })
})

test('el tipo del checklist se deduce del modelo (y cae a Otros)', () => {
  assert.equal(tipoDeDispositivo('iPhone 17 Pro Max'), 'iPhone')
  assert.equal(tipoDeDispositivo('iPad 10'), 'iPad')
  assert.equal(tipoDeDispositivo('MacBook Air M2'), 'MacBook')
  assert.equal(tipoDeDispositivo('AirPods Pro'), 'AirPods')
  assert.equal(tipoDeDispositivo('Apple Watch Ultra'), 'Apple Watch')
  assert.equal(tipoDeDispositivo('Watch Series 9'), 'Apple Watch')
  assert.equal(tipoDeDispositivo('Samsung Galaxy S24'), 'Otros')
  assert.equal(tipoDeDispositivo(''), 'Otros')
})

test('la variante junta capacidad y color para mostrarla al costado del modelo', () => {
  assert.equal(varianteDispositivo('iPhone 15 Pro · 256 GB · Titanio azul'), '256 GB · Titanio azul')
  assert.equal(varianteDispositivo('iPhone 13 · 128 GB'), '128 GB')
  assert.equal(varianteDispositivo('MacBook Air M2'), '')
  assert.equal(varianteDispositivo(''), '')
})
