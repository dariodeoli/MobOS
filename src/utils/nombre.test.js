import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarNombre, esApellidosPrimero } from './nombre.js'

test('normaliza mayúsculas y espacios a un nombre presentable', () => {
  assert.equal(normalizarNombre('  DARIO   OLIVEIRA  '), 'Dario Oliveira')
  assert.equal(normalizarNombre('MARÍA JOSÉ PÉREZ'), 'María José Pérez')
  // Un nombre ya escrito por el vendedor no se toca (ni siglas ni mayúsculas).
  assert.equal(normalizarNombre('Cliente E2E 4f2'), 'Cliente E2E 4f2')
  assert.equal(normalizarNombre('iPhone Store'), 'iPhone Store')
  assert.equal(normalizarNombre(''), '')
  assert.equal(normalizarNombre(null), '')
})

test('reordena "Apellido, Nombre" y nunca lo deja con coma', () => {
  assert.equal(normalizarNombre('PEREZ GOMEZ, JUAN CARLOS'), 'Juan Carlos Perez Gomez')
  assert.equal(normalizarNombre('OLIVEIRA, DARIO'), 'Dario Oliveira')
  assert.equal(normalizarNombre('DE LA CRUZ, ANA'), 'Ana de la Cruz')
  assert.equal(esApellidosPrimero('PEREZ, JUAN'), true)
  assert.equal(esApellidosPrimero('Juan Perez'), false)
})

test('respeta las partículas en minúscula', () => {
  assert.equal(normalizarNombre('MARIA DE LOS ANGELES GOMEZ'), 'Maria de los Angeles Gomez')
  assert.equal(normalizarNombre('JUAN DE LA CRUZ'), 'Juan de la Cruz')
})
