import assert from 'node:assert/strict'
import test from 'node:test'
import { conBandaDemo, TEXTO_BANDA_DEMO } from './bandaDemo.js'

test('la banda Demo se agrega una sola vez, justo después de abrir el body', () => {
  const html = '<!doctype html><html><head></head><body class="a4"><h1>Nota</h1></body></html>'
  const con = conBandaDemo(html)
  assert.ok(con.includes(TEXTO_BANDA_DEMO))
  assert.ok(con.indexOf('banda-demo') < con.indexOf('<h1>'), 'la banda va arriba del documento')
  assert.equal(conBandaDemo(con), con, 'no se duplica')
  assert.ok(conBandaDemo('<p>suelto</p>').startsWith('<div class="banda-demo"'))
})
