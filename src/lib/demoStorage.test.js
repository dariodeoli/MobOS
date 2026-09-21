import assert from 'node:assert/strict'
import test from 'node:test'
import { almacenamientoDemo, borrarDemo, guardarDemo, leerDemo, limpiarMemoriaDemo } from './demoStorage.js'

// #204: en demo los datos ficticios viven solo en memoria; jamás en localStorage.

test('en demo guarda y lee solo en memoria (no toca localStorage)', () => {
  let tocoLocal = false
  globalThis.localStorage = {
    getItem: () => { tocoLocal = true; return null },
    setItem: () => { tocoLocal = true },
    removeItem: () => { tocoLocal = true },
  }
  try {
    guardarDemo('mobos:demo-customers:v1', '{"a":1}', { demo: true })
    assert.equal(leerDemo('mobos:demo-customers:v1', { demo: true }), '{"a":1}')
    borrarDemo('mobos:demo-customers:v1', { demo: true })
    assert.equal(leerDemo('mobos:demo-customers:v1', { demo: true }), null, 'borrar deja de verlo')
    assert.equal(tocoLocal, false, 'la demo nunca toca localStorage')
  } finally {
    limpiarMemoriaDemo()
    delete globalThis.localStorage
  }
})

test('fuera de la demo delega en localStorage', () => {
  const datos = new Map()
  globalThis.localStorage = {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, valor),
    removeItem: (clave) => datos.delete(clave),
  }
  try {
    guardarDemo('mobos:demo-cash:v1', JSON.stringify({ caja: 1 }), { demo: false })
    assert.equal(datos.get('mobos:demo-cash:v1'), '{"caja":1}')
    assert.equal(leerDemo('mobos:demo-cash:v1', { demo: false }), '{"caja":1}')
    borrarDemo('mobos:demo-cash:v1', { demo: false })
    assert.equal(leerDemo('mobos:demo-cash:v1', { demo: false }), null)
  } finally {
    delete globalThis.localStorage
  }
})

test('sin almacenamiento disponible no rompe y devuelve null', () => {
  delete globalThis.localStorage
  guardarDemo('clave', 'valor', { demo: false })
  assert.equal(leerDemo('clave', { demo: false }), null)
  assert.equal(almacenamientoDemo({ demo: false }), null)
})
