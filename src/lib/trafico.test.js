import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { CLAVE_NO_MEDIR, MODULOS_DEMO, fijarNoMedir, optOutActivo, esEnlaceDeRegistro, moduloDeRuta, noMedir, nuevoId, scrollMaximoPct, utmDeBusqueda } from './trafico.js'

test('moduloDeRuta: primer tramo limpio; raíz = inicio', () => {
  assert.equal(moduloDeRuta('/pos'), 'pos')
  assert.equal(moduloDeRuta('/pedidos/abc123?x=1'), 'pedidos')
  assert.equal(moduloDeRuta('/'), 'inicio')
  assert.equal(moduloDeRuta('/Ñandú<script>'), 'otras')
  assert.equal(moduloDeRuta('/pos/abc/9'), 'pos')
})

test('utmDeBusqueda y scrollMaximoPct', () => {
  assert.equal(utmDeBusqueda('?utm_source=Facebook&x=1'), 'facebook')
  assert.equal(utmDeBusqueda('?x=1'), null)
  assert.equal(utmDeBusqueda('?utm_source=a.b'), 'ab')
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

test('la lista de módulos coincide con la del servidor (backend/lib/site-events.ts)', () => {
  const fuente = readFileSync(new URL('../../backend/lib/site-events.ts', import.meta.url), 'utf8')
  const bloque = fuente.match(/MODULOS_DEMO = \[([\s\S]*?)\] as const/)[1]
  assert.deepEqual([...bloque.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]), MODULOS_DEMO)
})

function storageFalso(inicial = {}) {
  const datos = { ...inicial }
  return {
    getItem: k => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v) },
    removeItem: k => { delete datos[k] },
    datos,
  }
}

test('«No medir»: se guarda la preferencia, se olvida el id y se puede revertir', () => {
  const st = storageFalso({ 'mobos:vid': 'a'.repeat(32) })
  assert.equal(optOutActivo(st), false)
  fijarNoMedir(true, st)
  assert.equal(st.datos[CLAVE_NO_MEDIR], '1')
  assert.equal(st.datos['mobos:vid'], undefined)
  assert.equal(optOutActivo(st), true)
  fijarNoMedir(false, st)
  assert.equal(optOutActivo(st), false)
})

test('«No medir» no rompe sin storage', () => {
  assert.equal(optOutActivo(null), false)
  assert.doesNotThrow(() => fijarNoMedir(true, null))
  const roto = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') }, removeItem() {} }
  assert.equal(optOutActivo(roto), false)
  assert.doesNotThrow(() => fijarNoMedir(true, roto))
})
