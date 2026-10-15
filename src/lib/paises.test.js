import assert from 'node:assert/strict'
import test from 'node:test'
import { PAISES_PREDETERMINADOS, buscarPaises, paisesPredeterminados } from './paises.js'

test('los países predeterminados van en el orden pedido (#389)', () => {
  assert.deepEqual(PAISES_PREDETERMINADOS, ['PY', 'AR', 'BR', 'UY', 'BO', 'CL', 'US', 'ES'])
  assert.deepEqual(paisesPredeterminados().map((pais) => pais.country), [...PAISES_PREDETERMINADOS])
  assert.equal(paisesPredeterminados()[0].name, 'Paraguay')
})

test('sin texto se ofrecen los predeterminados y con texto se busca en todo el catálogo sin acentos', () => {
  assert.equal(buscarPaises('').length, PAISES_PREDETERMINADOS.length)
  assert.ok(buscarPaises('para').some((pais) => pais.country === 'PY'))
  assert.ok(buscarPaises('peru').some((pais) => pais.country === 'PE'), 'Perú se encuentra sin acento')
  assert.ok(buscarPaises('JP').some((pais) => pais.country === 'JP'), 'también por ISO')
  assert.deepEqual(buscarPaises('zzzz'), [])
})
