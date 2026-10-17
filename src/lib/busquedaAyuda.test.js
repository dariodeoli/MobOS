import assert from 'node:assert/strict'
import test from 'node:test'
import { ayudaVisibleParaVistas, buscarAyuda, normalizarTextoAyuda } from './busquedaAyuda.js'

const entradas = [
  { modulo: 'Vender', titulo: 'Cargar una venta', ubicacion: 'Vender → POS', explicacion: 'Cobrar al cliente', ruta: '/pos' },
  { modulo: 'Finanzas', titulo: 'Caja del día', ubicacion: 'Finanzas → Caja', explicacion: 'Cerrar el arqueo', ruta: '/finanzas/caja' },
  { modulo: 'Configuración', titulo: 'Equipo y permisos', ubicacion: 'Configuración → Equipo', explicacion: 'Administrar integrantes', ruta: '/configuracion/equipo' },
]

test('la búsqueda global ignora acentos y mayúsculas y conserva la ruta de destino', () => {
  assert.equal(normalizarTextoAyuda('GARANTÍA y PIN'), 'garantia y pin')
  assert.deepEqual(buscarAyuda(entradas, 'CAJA', ['finanzas']).map(item => item.ruta), ['/finanzas/caja'])
})

test('la Ayuda limita resultados a vistas accesibles y no filtra datos con permisos ausentes', () => {
  assert.deepEqual(buscarAyuda(entradas, '', ['cargar']).map(item => item.titulo), ['Cargar una venta'])
  assert.deepEqual(buscarAyuda(entradas, 'equipo', ['cargar']), [])
  assert.equal(ayudaVisibleParaVistas(entradas[2], ['equipo']), true)
  assert.equal(ayudaVisibleParaVistas(entradas[2], ['cargar']), false)
  assert.equal(buscarAyuda(entradas, '').length, entradas.length, 'la vista sin sesión conserva compatibilidad')
})

test('la búsqueda acepta consultas vacías y entradas vacías con seguridad', () => {
  assert.deepEqual(buscarAyuda(null, 'venta', ['cargar']), [])
  assert.deepEqual(buscarAyuda(entradas, '   ', ['cargar']).map(item => item.titulo), ['Cargar una venta'])
})
