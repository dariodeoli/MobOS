import assert from 'node:assert/strict'
import test from 'node:test'
import { CACHE_GET_MS, crearCacheDeConsultas } from './requestCache.js'

test('guarda una consulta y la sirve dentro de la ventana', () => {
  let reloj = 1000
  const cache = crearCacheDeConsultas({ ahora: () => reloj })
  cache.guardar('GET /api/productos', { total: 3 })

  reloj += CACHE_GET_MS - 1

  assert.deepEqual(cache.leer('GET /api/productos'), { total: 3 })
})

test('la entrada vence al terminar la ventana y se descarta', () => {
  let reloj = 0
  const cache = crearCacheDeConsultas({ ahora: () => reloj })
  cache.guardar('GET /api/productos', [1, 2])

  reloj += CACHE_GET_MS

  assert.equal(cache.leer('GET /api/productos'), undefined)
  assert.equal(cache.tamano(), 0)
})

test('una ventana en cero o negativa no guarda nada', () => {
  const cache = crearCacheDeConsultas()
  cache.guardar('GET /api/a', 1, 0)
  cache.guardar('GET /api/b', 2, -1)

  assert.equal(cache.tamano(), 0)
})

test('null es un valor válido y se distingue de la ausencia', () => {
  const cache = crearCacheDeConsultas()
  cache.guardar('GET /api/vacio', null)

  assert.equal(cache.leer('GET /api/vacio'), null)
  assert.equal(cache.leer('GET /api/otra'), undefined)
})

test('cada clave vence por su cuenta', () => {
  let reloj = 0
  const cache = crearCacheDeConsultas({ ahora: () => reloj })
  cache.guardar('GET /api/corta', 'corta', 100)
  cache.guardar('GET /api/larga', 'larga', 1000)

  reloj = 150

  assert.equal(cache.leer('GET /api/corta'), undefined)
  assert.equal(cache.leer('GET /api/larga'), 'larga')
})

test('invalidar borra una clave e invalidarTodo limpia el resto', () => {
  const cache = crearCacheDeConsultas()
  cache.guardar('GET /api/a', 1)
  cache.guardar('GET /api/b', 2)

  cache.invalidar('GET /api/a')
  assert.equal(cache.leer('GET /api/a'), undefined)
  assert.equal(cache.leer('GET /api/b'), 2)

  cache.invalidarTodo()
  assert.equal(cache.tamano(), 0)
})
