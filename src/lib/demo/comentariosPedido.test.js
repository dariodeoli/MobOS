import assert from 'node:assert/strict'
import test from 'node:test'
import { agregarComentarioDemo, comentariosDemo, conComentariosDemo, limpiarComentario } from './comentariosPedido.js'

test('los comentarios de la demo se publican y se ordenan con la cronología', () => {
  const pedido = `ped-${Date.now()}`
  assert.equal(agregarComentarioDemo(pedido, { texto: '   ' }), null, 'vacío no se publica')
  const evento = agregarComentarioDemo(pedido, { texto: ' Retira mañana\u0007 ', usuario: { id: 'u1', nombre: 'Ana' } })
  assert.equal(evento.body, 'Retira mañana')
  assert.equal(evento.user.name, 'Ana')
  assert.equal(comentariosDemo(pedido).length, 1)
  const previo = { id: 'x', type: 'created', at: new Date(Date.now() - 86400000).toISOString() }
  const cronologia = conComentariosDemo(pedido, [previo])
  assert.equal(cronologia[0].type, 'comment', 'lo más nuevo va primero')
  assert.equal(limpiarComentario('a'.repeat(3000)).length, 2000)
})
