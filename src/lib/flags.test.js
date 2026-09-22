import assert from 'node:assert/strict'
import test from 'node:test'
import { esFlag, flagsV2, rutaV2 } from './flags.js'

// #241: la infraestructura F3 no se activa sola.

test('solo "1" activa un flag', () => {
  assert.equal(esFlag('1'), true)
  assert.equal(esFlag(' 1 '), true)
  assert.equal(esFlag('0'), false)
  assert.equal(esFlag(''), false)
  assert.equal(esFlag(undefined), false)
  assert.equal(esFlag(true), false)
})

test('por defecto todo apagado; el preview vive en dev o con su flag', () => {
  assert.deepEqual(flagsV2(), { opsV2: false, opsPreview: false })
  assert.deepEqual(flagsV2({ dev: true }), { opsV2: false, opsPreview: true })
  assert.deepEqual(flagsV2({ env: { VITE_OPS_PREVIEW: '1' } }), { opsV2: false, opsPreview: true })
  assert.deepEqual(flagsV2({ env: { VITE_OPS_V2: '1' } }), { opsV2: true, opsPreview: true })
})

test('las rutas responden al flag correspondiente', () => {
  assert.equal(rutaV2('/ops-preview', { opsPreview: true }), 'preview')
  assert.equal(rutaV2('/ops-preview', { opsPreview: false }), null)
  assert.equal(rutaV2('/ops', { opsV2: true }), 'activo')
  assert.equal(rutaV2('/ops', { opsV2: false, opsPreview: true }), null, 'el preview no activa /ops')
  assert.equal(rutaV2('/pos', { opsV2: true }), null)
})
