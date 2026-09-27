import assert from 'node:assert/strict'
import test from 'node:test'
import { combinarPerfil } from './sesionPerfil.js'

// #271: la respuesta del servidor manda; la copia del dispositivo es respaldo
// solo cuando no hubo respuesta (nunca para revivir una foto vieja).
const guardado = { name: 'Dueño', picture: 'https://google/vieja.jpg' }

test('sin respuesta del servidor se usa la copia guardada', () => {
  assert.deepEqual(combinarPerfil(undefined, guardado), guardado)
  assert.equal(combinarPerfil(undefined, null), null)
})

test('si el servidor respondió, su perfil manda (aunque venga vacío)', () => {
  assert.deepEqual(combinarPerfil({ name: 'Ana', picture: 'https://google/nueva.jpg' }, guardado), { name: 'Ana', picture: 'https://google/nueva.jpg' })
  assert.equal(combinarPerfil({}, guardado), null, 'sin nombre ni foto no se revive la copia')
  assert.equal(combinarPerfil(null, guardado), null, 'una respuesta nula tampoco revive la copia')
})

test('un perfil solo con nombre o solo con foto es válido', () => {
  assert.deepEqual(combinarPerfil({ name: 'Ana' }, guardado), { name: 'Ana' })
  assert.deepEqual(combinarPerfil({ picture: 'https://google/x.jpg' }, guardado), { picture: 'https://google/x.jpg' })
})
