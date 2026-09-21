import test from 'node:test'
import assert from 'node:assert/strict'
import { preferenciaPos, recordarPos } from './preferenciasPos.js'

function conAlmacenamiento() {
  const mapa = new Map()
  globalThis.localStorage = {
    getItem: (clave) => (mapa.has(clave) ? mapa.get(clave) : null),
    setItem: (clave, valor) => mapa.set(clave, String(valor)),
    removeItem: (clave) => mapa.delete(clave),
  }
  return mapa
}

test('preferenciaPos devuelve el último valor guardado o el predeterminado', () => {
  const mapa = conAlmacenamiento()
  assert.equal(preferenciaPos('cuenta', 'sin-cuenta'), 'sin-cuenta')
  recordarPos('cuenta', 'demo-cash-pyg')
  assert.equal(preferenciaPos('cuenta', 'sin-cuenta'), 'demo-cash-pyg')
  assert.equal(mapa.get('mobos:pos:cuenta'), 'demo-cash-pyg')
})

test('recordarPos con valor vacío borra la preferencia', () => {
  conAlmacenamiento()
  recordarPos('entrega', 'Delivery')
  assert.equal(preferenciaPos('entrega'), 'Delivery')
  recordarPos('entrega', '')
  assert.equal(preferenciaPos('entrega'), '')
})

test('sin localStorage no rompe: responde el predeterminado', () => {
  delete globalThis.localStorage
  assert.equal(preferenciaPos('entrega', 'Retiro en tienda'), 'Retiro en tienda')
  recordarPos('entrega', 'Delivery')
  assert.equal(preferenciaPos('entrega', 'Retiro en tienda'), 'Retiro en tienda')
})
