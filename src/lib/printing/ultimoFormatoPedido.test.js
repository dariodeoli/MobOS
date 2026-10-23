import assert from 'node:assert/strict'
import test from 'node:test'
import { crearMemoriaFormatoPedido, formatoPredeterminadoEmpresa, formatoImpresionValido } from './ultimoFormatoPedido.js'

const storageFalso = () => {
  const datos = new Map()
  return { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => { datos.set(k, String(v)) } }
}

test('cada usuario recuerda su propio último formato de impresión de pedidos', () => {
  const memoria = crearMemoriaFormatoPedido(storageFalso())
  assert.equal(memoria.ultimo('ana'), '', 'sin historial no hay formato recordado')
  memoria.recordar('ana', 'a4')
  memoria.recordar('beto', 'nota-entrega')
  assert.equal(memoria.ultimo('ana'), 'a4')
  assert.equal(memoria.ultimo('beto'), 'nota-entrega')
  memoria.recordar('ana', 'ticket-80')
  assert.equal(memoria.ultimo('ana'), 'ticket-80', 'el último elegido reemplaza al anterior')
  assert.equal(memoria.ultimo('beto'), 'nota-entrega', 'el de otro usuario no se toca')
})

test('un valor inválido o un storage roto no rompen', () => {
  const memoria = crearMemoriaFormatoPedido(storageFalso())
  memoria.recordar('ana', 'cualquier-cosa')
  assert.equal(memoria.ultimo('ana'), '')
  const roto = crearMemoriaFormatoPedido({ getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } })
  roto.recordar('ana', 'a4')
  assert.equal(roto.ultimo('ana'), '')
  assert.equal(formatoImpresionValido('pagina'), true)
})

test('el predeterminado de la empresa sigue a la impresora configurada', () => {
  assert.equal(formatoPredeterminadoEmpresa({ ancho: 80 }), 'ticket-80')
  assert.equal(formatoPredeterminadoEmpresa({ ancho: 0, formatoPreferido: 'a4' }), 'a4')
  assert.equal(formatoPredeterminadoEmpresa({}), 'a4')
})
