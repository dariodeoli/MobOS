import assert from 'node:assert/strict'
import test from 'node:test'
import { esEnlaceDeRegistro, moduloDeRuta, noMedir, nuevoId, scrollMaximoPct, utmDeBusqueda } from './trafico.js'

test('moduloDeRuta: primer tramo limpio; raíz = inicio', () => {
  assert.equal(moduloDeRuta('/pos'), 'pos')
  assert.equal(moduloDeRuta('/pedidos/abc123?x=1'), 'pedidos')
  assert.equal(moduloDeRuta('/'), 'inicio')
  assert.equal(moduloDeRuta('/Ñandú<script>'), 'andscript')
})

test('utmDeBusqueda y scrollMaximoPct', () => {
  assert.equal(utmDeBusqueda('?utm_source=Facebook&x=1'), 'facebook')
  assert.equal(utmDeBusqueda('?x=1'), null)
  assert.equal(scrollMaximoPct({ scrollTop: 500, altoVentana: 500, altoDocumento: 2000 }), 33)
  assert.equal(scrollMaximoPct({ scrollTop: 1500, altoVentana: 500, altoDocumento: 2000 }), 100)
  assert.equal(scrollMaximoPct({ scrollTop: 0, altoVentana: 800, altoDocumento: 600 }), 100)
})

test('enlaces de registro, DNT e id anónimo de 32 hex', () => {
  assert.equal(esEnlaceDeRegistro('https://app.moboss.online/login'), true)
  assert.equal(esEnlaceDeRegistro('/login?volver=/pos'), true)
  assert.equal(esEnlaceDeRegistro('/pos'), false)
  assert.equal(noMedir({ doNotTrack: '1' }), true)
  assert.equal(noMedir({ globalPrivacyControl: true }), true)
  assert.equal(noMedir({}), false)
  assert.match(nuevoId(), /^[a-f0-9]{32}$/)
})
