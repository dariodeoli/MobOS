import test from 'node:test'
import assert from 'node:assert/strict'
import { GRUPOS_HISTORIAL, desdePeriodo, filtrarEventos, grupoEvento, gruposValidos, resumenCompras } from './historialCliente.js'

const AHORA = Date.parse('2026-10-22T12:00:00Z')
const evento = (id, type, label, dias, extra = {}) => ({ id, type, action: label, label, createdAt: new Date(AHORA - dias * 86400000).toISOString(), ...extra })

test('grupoEvento clasifica cada tipo de historial del cliente', () => {
  const casos = [
    [{ type: 'order', action: 'Pedido creado' }, 'compras'],
    [{ type: 'payment', action: 'Pago confirmado' }, 'pagos'],
    [{ type: 'credit', action: 'Saldo a favor otorgado' }, 'saldo'],
    [{ type: 'audit', action: 'Cuota vencida con saldo' }, 'saldo'],
    [{ type: 'followUp', action: 'Cuota programada' }, 'saldo'],
    [{ type: 'quote', action: 'Cotización' }, 'cotizaciones'],
    [{ type: 'audit', action: 'CUSTOMER_QUOTE_SHARED', label: 'Cotización enviada' }, 'cotizaciones'],
    [{ type: 'service', action: 'Equipo en taller' }, 'taller'],
    [{ type: 'warranty', action: 'Garantía registrada' }, 'garantias'],
    [{ type: 'tradein', action: 'Equipo recibido en parte de pago' }, 'tradein'],
    [{ type: 'notice', action: 'Mensaje al cliente' }, 'mensajes'],
    [{ type: 'message', action: 'Correo enviado' }, 'mensajes'],
    [{ type: 'note', action: 'Comentario del equipo' }, 'notas'],
    [{ type: 'followUp', action: 'Seguimiento agendado' }, 'notas'],
    [{ type: 'customer', action: 'Cliente creado' }, 'datos'],
    [{ type: 'audit', action: 'CUSTOMER_UPDATED', label: 'Datos del cliente actualizados' }, 'datos'],
  ]
  for (const [entrada, esperado] of casos) assert.equal(grupoEvento(entrada), esperado, JSON.stringify(entrada))
})

test('todos los grupos del filtro existen y los desconocidos se descartan', () => {
  assert.deepEqual(gruposValidos('compras, pagos ,nada,todo'), ['compras', 'pagos'])
  assert.deepEqual(gruposValidos(''), [])
  assert.ok(GRUPOS_HISTORIAL.some((grupo) => grupo.key === 'todo'))
})

test('filtrarEventos combina tipo y período sin tocar el orden', () => {
  const lista = [
    evento('a', 'order', 'Pedido creado', 5),
    evento('b', 'payment', 'Pago confirmado', 40),
    evento('c', 'quote', 'Cotización', 200),
    evento('d', 'order', 'Pedido creado', 400),
  ]
  assert.deepEqual(filtrarEventos(lista, { grupos: ['compras'], ahora: AHORA }).map((e) => e.id), ['a', 'd'])
  assert.deepEqual(filtrarEventos(lista, { periodo: '90', ahora: AHORA }).map((e) => e.id), ['a', 'b'])
  assert.deepEqual(filtrarEventos(lista, { grupos: ['compras'], periodo: '365', ahora: AHORA }).map((e) => e.id), ['a'])
  assert.equal(filtrarEventos(lista, { ahora: AHORA }).length, 4)
  assert.equal(desdePeriodo('todo', AHORA), null)
})

test('resumenCompras: gastado, ticket promedio, última compra y frecuencia ignoran anulados', () => {
  const pedidos = [
    { status: 'COMPLETED', totalPyg: 1000000, createdAt: '2026-08-01T10:00:00Z' },
    { status: 'COMPLETED', totalPyg: 3000000, createdAt: '2026-09-01T10:00:00Z' },
    { status: 'CANCELLED', totalPyg: 9000000, createdAt: '2026-10-01T10:00:00Z' },
  ]
  const resumen = resumenCompras(pedidos)
  assert.equal(resumen.pedidos, 2)
  assert.equal(resumen.gastadoPyg, 4000000)
  assert.equal(resumen.ticketPromedioPyg, 2000000)
  assert.equal(resumen.ultimaCompra, '2026-09-01T10:00:00.000Z')
  assert.equal(resumen.frecuenciaDias, 31)
  assert.deepEqual(resumenCompras([]), { pedidos: 0, gastadoPyg: 0, ticketPromedioPyg: 0, ultimaCompra: null, frecuenciaDias: null })
})
