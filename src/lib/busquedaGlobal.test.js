import assert from 'node:assert/strict'
import test from 'node:test'
import { MENSAJES_BUSQUEDA, clasificarFallo, estadoBusqueda, filtrarLocal, mensajeDeEstado } from './busquedaGlobal.js'

test('#296 · el fallo se clasifica en servicio, conexión o esperable', () => {
  assert.equal(clasificarFallo({ status: 503 }), 'servicio')
  assert.equal(clasificarFallo({ status: 500 }), 'servicio')
  assert.equal(clasificarFallo(new TypeError('Failed to fetch')), 'conexion')
  assert.equal(clasificarFallo(Object.assign(new Error('abort'), { name: 'AbortError' })), 'conexion')
  // Un 403/404 no es una caída: el rol cambió o el endpoint no aplica.
  assert.equal(clasificarFallo({ status: 403 }), null)
  assert.equal(clasificarFallo({ status: 401 }), null)
  assert.equal(clasificarFallo({ status: 404 }), null)
})

test('#296 · los tres estados son claros y no se pisan', () => {
  assert.equal(estadoBusqueda({ resultados: [1], fallos: ['conexion'] }), 'listo')
  assert.equal(estadoBusqueda({ resultados: [], fallos: ['conexion', 'servicio'] }), 'conexion')
  assert.equal(estadoBusqueda({ resultados: [], fallos: ['servicio'] }), 'servicio')
  assert.equal(estadoBusqueda({ resultados: [], fallos: [] }), 'vacio')
  assert.equal(estadoBusqueda({}), 'vacio')
  assert.match(mensajeDeEstado('conexion'), /Sin conexión/)
  assert.match(mensajeDeEstado('servicio'), /servicio no está disponible/)
  assert.equal(mensajeDeEstado('vacio'), '')
  assert.equal(mensajeDeEstado('listo'), '')
  // Los mensajes viven en un solo lugar.
  assert.equal(mensajeDeEstado('servicio'), MENSAJES_BUSQUEDA.servicio)
})

test('#296 · el filtro local usa título y detalle sin distinguir mayúsculas ni acentos', () => {
  const filas = [
    { titulo: 'María Benítez', subtitulo: '0981 000 111' },
    { titulo: 'iPhone 15', subtitulo: 'SKU E2E-IPHONE15' },
  ]
  assert.deepEqual(filtrarLocal(filas, 'maria').map((f) => f.titulo), ['María Benítez'])
  assert.deepEqual(filtrarLocal(filas, 'MARÍA').map((f) => f.titulo), ['María Benítez'])
  assert.deepEqual(filtrarLocal(filas, 'iphone').map((f) => f.titulo), ['iPhone 15'])
  assert.deepEqual(filtrarLocal(filas, 'e2e-iphone').map((f) => f.titulo), ['iPhone 15'])
  assert.deepEqual(filtrarLocal(filas, ''), [])
  assert.deepEqual(filtrarLocal(undefined, 'algo'), [])
})
