import assert from 'node:assert/strict'
import { fechaParametro, filtrarEventos, grupoEvento, gruposValidos, resumenCompras } from '../lib/customer-history'
import { paginaDeEventos } from '../lib/history-page'

// Cada tipo de evento del historial del cliente cae en un grupo de filtro.
const casos: Array<[{ type: string; action: string; label?: string }, string]> = [
  [{ type: 'order', action: 'Pedido creado' }, 'compras'],
  [{ type: 'payment', action: 'Pago confirmado' }, 'pagos'],
  [{ type: 'credit', action: 'Saldo a favor otorgado' }, 'saldo'],
  [{ type: 'credit', action: 'Cuota pendiente' }, 'saldo'],
  [{ type: 'quote', action: 'Cotización' }, 'cotizaciones'],
  [{ type: 'audit', action: 'CUSTOMER_QUOTE_SHARED', label: 'Cotización enviada' }, 'cotizaciones'],
  [{ type: 'service', action: 'SERVICE_ORDER_CREATED', label: 'Equipo en taller' }, 'taller'],
  [{ type: 'warranty', action: 'Garantía registrada' }, 'garantias'],
  [{ type: 'tradein', action: 'Equipo recibido en parte de pago' }, 'tradein'],
  [{ type: 'notice', action: 'Mensaje al cliente' }, 'mensajes'],
  [{ type: 'message', action: 'Correo enviado' }, 'mensajes'],
  [{ type: 'note', action: 'Comentario del equipo' }, 'notas'],
  [{ type: 'followUp', action: 'Seguimiento agendado' }, 'notas'],
  [{ type: 'customer', action: 'Cliente creado' }, 'datos'],
  [{ type: 'audit', action: 'CUSTOMER_UPDATED', label: 'Datos del cliente actualizados' }, 'datos'],
]
for (const [evento, esperado] of casos) assert.equal(grupoEvento({ ...evento, createdAt: new Date() }), esperado, JSON.stringify(evento))

// Los grupos desconocidos se descartan: nunca llegan a una consulta.
assert.deepEqual(gruposValidos('compras, pagos ,drop table,'), ['compras', 'pagos'])
assert.deepEqual(gruposValidos(null), [])

// Fechas del filtro: día completo para `hasta`, inválidas = sin filtro.
assert.equal(fechaParametro('2026-10-01')?.toISOString(), '2026-10-01T00:00:00.000Z')
assert.equal(fechaParametro('2026-10-01', true)?.toISOString(), '2026-10-01T23:59:59.999Z')
assert.equal(fechaParametro('no-es-fecha'), null)
assert.equal(fechaParametro(''), null)

const eventos = [
  { id: 'a', type: 'order', action: 'Pedido creado', createdAt: new Date('2026-10-10T10:00:00Z') },
  { id: 'b', type: 'payment', action: 'Pago confirmado', createdAt: new Date('2026-09-10T10:00:00Z') },
  { id: 'c', type: 'quote', action: 'Cotización', createdAt: new Date('2026-05-10T10:00:00Z') },
]
assert.deepEqual(filtrarEventos(eventos, { grupos: ['compras', 'pagos'] }).map(e => e.id), ['a', 'b'])
assert.deepEqual(filtrarEventos(eventos, { desde: new Date('2026-09-01T00:00:00Z') }).map(e => e.id), ['a', 'b'])
assert.deepEqual(filtrarEventos(eventos, { hasta: new Date('2026-09-30T00:00:00Z') }).map(e => e.id), ['b', 'c'])
assert.equal(filtrarEventos(eventos, {}).length, 3)

// Totales: los pedidos anulados no cuentan.
const resumen = resumenCompras([
  { status: 'COMPLETED', totalPyg: BigInt(1000000), createdAt: new Date('2026-08-01T10:00:00Z') },
  { status: 'COMPLETED', totalPyg: BigInt(3000000), createdAt: new Date('2026-09-01T10:00:00Z') },
  { status: 'CANCELLED', totalPyg: BigInt(9000000), createdAt: new Date('2026-10-01T10:00:00Z') },
])
assert.equal(resumen.pedidos, 2)
assert.equal(resumen.gastadoPyg, 4000000)
assert.equal(resumen.ticketPromedioPyg, 2000000)
assert.equal(resumen.frecuenciaDias, 31)

// Paginado por desplazamiento: 25 por defecto, tope 100, siguiente solo si hay más.
const muchos = Array.from({ length: 130 }, (_, i) => i)
const primera = paginaDeEventos(muchos, new URLSearchParams('limit=50'))
assert.equal(primera.events.length, 50)
assert.equal(primera.nextOffset, 50)
const ultima = paginaDeEventos(muchos, new URLSearchParams('limit=50&offset=100'))
assert.equal(ultima.events.length, 30)
assert.equal(ultima.nextOffset, null)
assert.equal(paginaDeEventos(muchos, new URLSearchParams('limit=999')).events.length, 100)
assert.equal(paginaDeEventos(muchos, new URLSearchParams('limit=x&offset=-4')).events.length, 25)
