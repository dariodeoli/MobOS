import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarNombre, esApellidosPrimero, esRazonSocial } from './nombre.js'

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

test('ordena el formato SIFEN "apellidos primero" cuando viene en mayúsculas', () => {
  // El proveedor de RUC devuelve A1 A2 N1 N2 en mayúsculas y sin coma.
  assert.equal(normalizarNombre('PEREZ GOMEZ JUAN CARLOS', { apellidosPrimero: 'sifen' }), 'Juan Carlos Perez Gomez')
  assert.equal(normalizarNombre('PEREZ GOMEZ JUAN', { apellidosPrimero: 'sifen' }), 'Juan Perez Gomez')
  // Con dos palabras no se adivina el orden (se deja tal cual); forzado, sí.
  assert.equal(normalizarNombre('OLIVEIRA DARIO', { apellidosPrimero: 'sifen' }), 'Oliveira Dario')
  assert.equal(normalizarNombre('OLIVEIRA DARIO', { apellidosPrimero: true }), 'Dario Oliveira')
  // Un nombre escrito por el vendedor (no todo mayúsculas) se respeta.
  assert.equal(normalizarNombre('Juan Carlos Perez', { apellidosPrimero: 'sifen' }), 'Juan Carlos Perez')
})

test('las razones sociales del RUC no se reordenan ni se capitalizan como personas (#234)', () => {
  // El extractor de RUC completa empresas: S.A., S.R.L. y cooperativas se
  // respetan tal cual, aunque vengan en mayúsculas y con 3+ palabras.
  for (const razon of ['DISTRIBUIDORA DEL SUR S.A.', 'IMPORTADORA GUARANÍ S.R.L.', 'COOPERATIVA LA UNION LTDA.', 'TECNOLOGÍA PARAGUAY S.A.']) {
    assert.equal(normalizarNombre(razon, { apellidosPrimero: 'sifen' }), razon)
    assert.equal(normalizarNombre(razon), razon)
  }
  assert.equal(esRazonSocial('DISTRIBUIDORA DEL SUR S.A.'), true)
  assert.equal(esRazonSocial('PEREZ GOMEZ JUAN CARLOS'), false)
})
