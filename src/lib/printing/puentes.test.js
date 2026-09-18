import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizarDestino, normalizarPuentes, normalizarStore, puenteDe, URL_AGENTE_DEFECTO } from './puentes.js'

test('un store viejo (url/token globales) migra a un puente predeterminado', () => {
  const store = normalizarStore({
    agentUrl: 'http://192.168.100.110:17890',
    agentToken: 'abc123',
    impresoras: [{ id: 'imp-1', nombre: 'Mostrador' }],
  })
  assert.equal(store.bridges.length, 1)
  assert.equal(store.bridges[0].url, 'http://192.168.100.110:17890')
  assert.equal(store.bridges[0].token, 'abc123')
  assert.equal(store.bridges[0].predeterminado, true)
})

test('un store ya normalizado se devuelve tal cual', () => {
  const original = { agentUrl: '', agentToken: '', bridges: [{ id: 'p-1', url: 'http://a:17890', token: '', predeterminado: true }], impresoras: [] }
  assert.equal(normalizarStore(original), original)
  assert.equal(normalizarStore(null), null)
  assert.equal(normalizarStore({ impresoras: 'no-es-array' }), null)
})

test('cada impresora usa su puente; sin elección usa el predeterminado', () => {
  const store = {
    bridges: [
      { id: 'p-1', nombre: 'A', url: 'http://a:17890', token: 'tok-a', predeterminado: false },
      { id: 'p-2', nombre: 'B', url: 'http://b:17890', token: 'tok-b', predeterminado: true },
    ],
    impresoras: [],
  }
  assert.equal(puenteDe(store, { bridgeId: 'p-1' }).url, 'http://a:17890')
  assert.equal(puenteDe(store, { bridgeId: 'no-existe' }).url, 'http://b:17890')
  assert.equal(puenteDe(store, null).url, 'http://b:17890')
})

test('sin puentes cae a la url global o al valor por defecto', () => {
  assert.equal(puenteDe({ agentUrl: 'http://global:17890', agentToken: 't', bridges: [] }).url, 'http://global:17890')
  assert.equal(puenteDe({}).url, URL_AGENTE_DEFECTO)
})

test('guardar puentes deja un solo predeterminado y descarta los vacíos', () => {
  const lista = normalizarPuentes([
    { id: 'p-1', nombre: 'A', url: 'http://a:17890', token: '', predeterminado: true },
    { id: 'p-2', nombre: 'B', url: 'http://b:17890', token: '', predeterminado: true },
    { id: 'p-3', nombre: 'sin url', url: '  ', token: '', predeterminado: false },
  ])
  assert.equal(lista.length, 2)
  assert.equal(lista.filter((puente) => puente.predeterminado).length, 1)
  assert.equal(lista[0].predeterminado, true)
  assert.equal(lista[1].predeterminado, false)
  assert.equal(normalizarPuentes([])[0], undefined)
})

test('el prefijo usb: de una cola CUPS migra a cups: y lan queda igual', () => {
  assert.equal(normalizarDestino('usb:ZKP8008'), 'cups:ZKP8008')
  assert.equal(normalizarDestino('cups:ZKP8008'), 'cups:ZKP8008')
  assert.equal(normalizarDestino('lan:192.168.1.23:9100'), 'lan:192.168.1.23:9100')
  assert.equal(normalizarDestino(''), '')
})
