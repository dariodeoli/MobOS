import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveUltimo, leerUltimo, recordarUltimo } from './ultimoUsado.js'

// Almacenamiento de prueba, independiente de lo que exponga Node.
const crearStorage = () => {
  const mapa = new Map()
  globalThis.localStorage = {
    getItem: (clave) => (mapa.has(clave) ? mapa.get(clave) : null),
    setItem: (clave, valor) => mapa.set(clave, String(valor)),
    removeItem: (clave) => mapa.delete(clave),
  }
  return mapa
}

test('la clave queda namespaced', () => {
  assert.equal(claveUltimo('clientes:filtro'), 'mobos:ultimo:clientes:filtro')
  assert.equal(claveUltimo(' wa:plantilla:CUSTOMERS '), 'mobos:ultimo:wa:plantilla:CUSTOMERS')
})

test('sin valor guardado devuelve el default sensible', () => {
  crearStorage()
  assert.equal(leerUltimo('clientes:filtro', 'todos'), 'todos')
  assert.equal(leerUltimo('sin:valor', ''), '')
})

test('recordar guarda el último usado y leer lo devuelve', () => {
  crearStorage()
  recordarUltimo('wa:plantilla:CUSTOMERS', 'plantilla-8')
  assert.equal(leerUltimo('wa:plantilla:CUSTOMERS'), 'plantilla-8')
  recordarUltimo('wa:plantilla:CUSTOMERS', 'plantilla-9')
  assert.equal(leerUltimo('wa:plantilla:CUSTOMERS', 'x'), 'plantilla-9')
})

test('vaciar el valor borra la preferencia (vuelve al default)', () => {
  crearStorage()
  recordarUltimo('garantias:filtro', 'RECIBIDO')
  recordarUltimo('garantias:filtro', '')
  assert.equal(leerUltimo('garantias:filtro', 'todos'), 'todos')
})

test('sin almacenamiento no rompe y devuelve el default', () => {
  const previo = globalThis.localStorage
  delete globalThis.localStorage
  try {
    assert.equal(leerUltimo('x', 'default'), 'default')
    recordarUltimo('x', 'valor')
  } finally {
    globalThis.localStorage = previo
  }
})
