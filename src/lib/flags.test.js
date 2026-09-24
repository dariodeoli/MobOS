import assert from 'node:assert/strict'
import test from 'node:test'
import { esFlag, flagsV2, rutaV2 } from './flags.js'

// #241: el tablero operativo quedó activo con la aprobación del rollout
// (paso 3); la salida de emergencia es VITE_OPS_V2=0 y el preview sigue en dev.

test('solo "1" activa un flag', () => {
  assert.equal(esFlag('1'), true)
  assert.equal(esFlag(' 1 '), true)
  assert.equal(esFlag('0'), false)
  assert.equal(esFlag(''), false)
  assert.equal(esFlag(undefined), false)
  assert.equal(esFlag(true), false)
})

test('el tablero está activo por defecto y el preview vive en dev o con su flag', () => {
  assert.deepEqual(flagsV2(), { opsV2: true, opsPreview: false })
  assert.deepEqual(flagsV2({ dev: true }), { opsV2: true, opsPreview: true })
  assert.deepEqual(flagsV2({ env: { VITE_OPS_PREVIEW: '1' } }), { opsV2: true, opsPreview: true })
  assert.deepEqual(flagsV2({ env: { VITE_OPS_V2: '0' } }), { opsV2: false, opsPreview: false }, 'VITE_OPS_V2=0 apaga el tablero')
  assert.deepEqual(flagsV2({ env: { VITE_OPS_V2: '1' } }), { opsV2: true, opsPreview: false })
})

test('las rutas responden al flag correspondiente', () => {
  assert.equal(rutaV2('/ops-preview', { opsPreview: true }), 'preview')
  assert.equal(rutaV2('/ops-preview', { opsPreview: false }), null)
  assert.equal(rutaV2('/ops', { opsV2: true }), 'activo')
  assert.equal(rutaV2('/ops', { opsV2: false, opsPreview: true }), null, 'el preview no activa /ops')
  assert.equal(rutaV2('/pos', { opsV2: true }), null)
})
