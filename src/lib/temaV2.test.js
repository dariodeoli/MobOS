import assert from 'node:assert/strict'
import test from 'node:test'
import { TEMA_V2_POR_DEFECTO, activarTemaV2, temaV2Activo, temaV2PorDefecto } from './temaV2.js'

// #241 · F4: el switch de activación del rollout v2 es `VITE_TEMA_V2`; cada
// dispositivo puede salir o volver con `mobos:tema-v2`.

test('el switch de F4 sale de VITE_TEMA_V2 (prendido salvo "0")', () => {
  assert.equal(temaV2PorDefecto({}), true, 'sin variable, el v2 es el default')
  assert.equal(temaV2PorDefecto({ VITE_TEMA_V2: '1' }), true)
  assert.equal(temaV2PorDefecto({ VITE_TEMA_V2: ' 0 ' }), false, 'acepta el valor con espacios')
  assert.equal(temaV2PorDefecto({ VITE_TEMA_V2: '0' }), false)
  assert.equal(temaV2PorDefecto({ VITE_TEMA_V2: 'no' }), true, 'solo "0" apaga')
})

function conAlmacenamiento() {
  const datos = new Map()
  const eventos = []
  globalThis.window = {
    localStorage: {
      getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
      setItem: (clave, valor) => datos.set(clave, String(valor)),
      removeItem: (clave) => datos.delete(clave),
    },
    dispatchEvent: (evento) => eventos.push(evento?.type || 'evento'),
  }
  return { datos, eventos }
}

test('el dispositivo manda sobre el default: opt-out y vuelta al v2', () => {
  const { datos, eventos } = conAlmacenamiento()
  try {
    assert.equal(temaV2Activo(), TEMA_V2_POR_DEFECTO, 'sin valor guardado usa el switch')
    activarTemaV2(false)
    assert.equal(temaV2Activo(), false, 'el opt-out por dispositivo gana')
    assert.equal(datos.get('mobos:tema-v2'), '0')
    activarTemaV2(true)
    assert.equal(temaV2Activo(), true, 'se puede volver al v2')
    assert.equal(datos.get('mobos:tema-v2'), '1')
    assert.deepEqual(eventos, ['mobos:tema-v2-cambio', 'mobos:tema-v2-cambio'])
  } finally {
    delete globalThis.window
  }
})

test('sin almacenamiento disponible cae al switch, sin romper', () => {
  globalThis.window = {
    localStorage: { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } },
    dispatchEvent: () => {},
  }
  try {
    assert.equal(temaV2Activo(), TEMA_V2_POR_DEFECTO)
    assert.doesNotThrow(() => activarTemaV2(false))
  } finally {
    delete globalThis.window
  }
})
