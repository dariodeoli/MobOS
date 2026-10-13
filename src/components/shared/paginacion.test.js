import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rangoAcumulado, rangoPagina, textoMostrando, TAMANO_PAGINA_DEFECTO } from './paginacion.js'

test('rangoPagina calcula páginas, límites y rango 1-based', () => {
  assert.deepEqual(rangoPagina(22, 0, 3), { paginas: 8, actual: 0, inicio: 0, fin: 3, desde: 1, hasta: 3, size: 3 })
  assert.equal(rangoPagina(22, 7, 3).hasta, 22)
  assert.equal(rangoPagina(22, 7, 3).desde, 22)
  assert.equal(rangoPagina(22, 99, 3).actual, 7, 'una página fuera de rango se acota a la última')
  assert.equal(rangoPagina(22, -4, 3).actual, 0)
})

test('rangoPagina con lista vacía o tamaño inválido no rompe', () => {
  assert.deepEqual(rangoPagina(0, 0, 5), { paginas: 1, actual: 0, inicio: 0, fin: 0, desde: 0, hasta: 0, size: 5 })
  assert.equal(rangoPagina(25, 0, 0).size, TAMANO_PAGINA_DEFECTO)
  assert.equal(rangoPagina(undefined, undefined, undefined).paginas, 1)
})

test('rangoAcumulado acumula desde el principio y avisa si hay más', () => {
  assert.deepEqual(rangoAcumulado(25, 10), { inicio: 0, fin: 10, hayMas: true })
  assert.deepEqual(rangoAcumulado(25, 30), { inicio: 0, fin: 25, hayMas: false })
  assert.equal(rangoAcumulado(0, 10).hayMas, false)
})

test('textoMostrando muestra X de Y sin abreviar', () => {
  assert.equal(textoMostrando(3, 22), 'Mostrando 3 de 22')
  assert.equal(textoMostrando(undefined, 'x'), 'Mostrando 0 de 0')
})

test('PieListado y ListaDensa conservan el contrato de accesibilidad y mantienen 44px', () => {
  const pie = readFileSync('src/components/shared/PieListado.jsx', 'utf8')
  assert.ok(pie.includes('aria-label={etiqueta}'))
  assert.ok(pie.includes('role="status"'))
  assert.ok(pie.includes('Cargar más'))
  assert.ok(pie.includes('Anterior') && pie.includes('Siguiente'))
  assert.equal((pie.match(/min-h-11/g) || []).length, 3, 'todos los botones del pie miden 44px')
  const hook = readFileSync('src/components/shared/usePaginaLista.js', 'utf8')
  assert.ok(hook.includes("modo = 'paginas'") && hook.includes('cargarMas'))
  const lista = readFileSync('src/components/shared/ListaDensa.jsx', 'utf8')
  assert.ok(lista.includes('PieListado') && lista.includes('renderFila'))
})
