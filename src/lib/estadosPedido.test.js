// #215/#241: el avance de una garantía sale del mismo mapa que usan la tabla y
// el tablero por etapas (una sola fuente del ciclo de vida).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO_GARANTIA, SIGUIENTE_GARANTIA } from './estadosPedido.js'

test('el avance de la garantía recorre sus cuatro etapas y se detiene en la entregada', () => {
  assert.deepEqual(Object.keys(ESTADO_GARANTIA), ['RECEIVED', 'DIAGNOSIS', 'READY', 'DELIVERED'])
  assert.deepEqual(SIGUIENTE_GARANTIA, { RECEIVED: 'DIAGNOSIS', DIAGNOSIS: 'READY', READY: 'DELIVERED' })
  assert.equal(SIGUIENTE_GARANTIA.DELIVERED, undefined, 'la entregada no avanza')
})
