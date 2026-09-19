import assert from 'node:assert/strict'
import test from 'node:test'
import { esLoopback, resolverCamino, urlDePuente } from './ruteo.js'

const storeBase = (cambios = {}) => ({
  agentUrl: 'http://127.0.0.1:17890',
  agentToken: 'token-local',
  localBridgeId: '',
  bridges: [],
  impresoras: [],
  ...cambios,
})

const impresora = (cambios = {}) => ({ id: 'imp-1', nombre: 'Mostrador', destino: 'lan:192.168.1.23:9100', bridgeId: '', ...cambios })

test('sin agente local todo va remoto, aunque la url sea loopback', () => {
  assert.equal(resolverCamino(storeBase(), impresora(), { disponible: false }).camino, 'remoto')
  assert.equal(resolverCamino(storeBase(), impresora(), { disponible: false }).motivo, 'sin-agente-local')
  assert.equal(resolverCamino(storeBase(), impresora()).camino, 'remoto')
})

test('con agente local y puente loopback imprime local', () => {
  assert.deepEqual(resolverCamino(storeBase(), impresora(), { disponible: true }), { camino: 'local', motivo: 'agente-local' })
})

test('un puente con IP de la red no es local aunque el agente responda', () => {
  const store = storeBase({ bridges: [{ id: 'p-1', url: 'http://192.168.100.110:17890', token: 't', predeterminado: true }] })
  assert.equal(resolverCamino(store, impresora({ bridgeId: 'p-1' }), { disponible: true }).motivo, 'puente-no-local')
})

test('una impresora de otro puente va remoto en la Mac local', () => {
  const store = storeBase({ localBridgeId: 'p-local', bridges: [{ id: 'p-local', url: 'http://127.0.0.1:17890', token: 't', predeterminado: true }] })
  assert.equal(resolverCamino(store, impresora({ bridgeId: 'p-otro' }), { disponible: true }).motivo, 'otro-puente')
  assert.equal(resolverCamino(store, impresora({ bridgeId: 'p-local' }), { disponible: true }).camino, 'local')
  assert.equal(resolverCamino(store, impresora(), { disponible: true }).camino, 'local')
})

test('el espejo del backend sin URL usa el agente de esta computadora', () => {
  const store = storeBase({ bridges: [{ id: 'b-1', nombre: 'Mac local', url: '', token: '', backend: true, predeterminado: true }] })
  assert.equal(urlDePuente(store, impresora({ bridgeId: 'b-1' })), 'http://127.0.0.1:17890')
  assert.equal(resolverCamino(store, impresora({ bridgeId: 'b-1' }), { disponible: true }).camino, 'local')
})

test('loopback reconoce localhost, puerto y barra final; no a un host parecido', () => {
  assert.equal(esLoopback('http://127.0.0.1:17890'), true)
  assert.equal(esLoopback('http://127.0.0.1:17890/'), true)
  assert.equal(esLoopback('https://localhost'), true)
  assert.equal(esLoopback('HTTP://LOCALHOST:17890'), true)
  assert.equal(esLoopback('http://127.0.0.1.evil.com:17890'), false)
  assert.equal(esLoopback('http://192.168.1.5:17890'), false)
  assert.equal(esLoopback(''), false)
})
