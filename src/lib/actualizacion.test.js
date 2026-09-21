import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleEnHtml, esVersionNueva } from './actualizacion.js'

// #214: detección de versión nueva del shell a partir del bundle del index.html.

const HTML = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-AHWUn_2K.js"></script></head><body></body></html>'

test('extrae el bundle hasheado del HTML desplegado', () => {
  assert.equal(bundleEnHtml(HTML), '/assets/index-AHWUn_2K.js')
})

test('en dev (sin bundle hasheado) no hay versión nueva que avisar', () => {
  const dev = '<!doctype html><html><body><script type="module" src="/src/main.jsx"></script></body></html>'
  assert.equal(bundleEnHtml(dev), null)
  assert.equal(esVersionNueva('/src/main.jsx', dev), false)
})

test('avisa solo cuando el bundle servido es distinto del cargado', () => {
  assert.equal(esVersionNueva('/assets/index-AHWUn_2K.js', HTML), false)
  assert.equal(esVersionNueva('/assets/index-VIEJA.js', HTML), true)
  assert.equal(esVersionNueva('', HTML), false, 'sin bundle cargado no se avisa')
  assert.equal(esVersionNueva('/assets/index-AHWUn_2K.js', ''), false)
})
