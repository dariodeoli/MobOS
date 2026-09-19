import assert from 'node:assert/strict'
import test from 'node:test'
import { alternarId, seleccionarTodos } from './seleccionLote.js'

test('alternar agrega y saca sin repetir', () => {
  assert.deepEqual(alternarId([], 'a'), ['a'])
  assert.deepEqual(alternarId(['a'], 'a'), [])
  assert.deepEqual(alternarId(['a'], 'b'), ['a', 'b'])
})

test('seleccionar visibles marca todas o las limpia si ya estaban todas', () => {
  const filas = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(seleccionarTodos(filas, []), ['a', 'b'])
  assert.deepEqual(seleccionarTodos(filas, ['a']), ['a', 'b'])
  assert.deepEqual(seleccionarTodos(filas, ['a', 'b']), [])
  assert.deepEqual(seleccionarTodos([], []), [])
})
