import { consolidarNecesidades } from '../lib/supply'
import assert from 'node:assert/strict'
import test from 'node:test'
import { demandasDePedido, demandaDeReserva, demandaBajoMinimo, normalizarCentro, prioridadPorPromesa, semanaClave } from '../lib/supply-demand'

// #250 F1 · Motor de demanda: venta sin stock, cantidad > stock, pedido
// comprometido con fecha, reserva/backorder y punto de reposición.

test('prioridadPorPromesa ordena la urgencia de la fecha comprometida', () => {
  const ahora = new Date('2026-09-26T12:00:00.000Z')
  assert.equal(prioridadPorPromesa(null, ahora), 'NORMAL')
  assert.equal(prioridadPorPromesa('2026-09-25T12:00:00.000Z', ahora), 'URGENTE')
  assert.equal(prioridadPorPromesa('2026-09-27T12:00:00.000Z', ahora), 'ALTA')
  assert.equal(prioridadPorPromesa('2026-10-10T12:00:00.000Z', ahora), 'NORMAL')
})

test('una venta sobre pedido sin stock genera SALE_NO_STOCK con el vínculo al pedido', () => {
  const demandas = demandasDePedido({
    orderId: 'order-1',
    items: [{ productId: 'prod-1', condition: 'NEW', quantity: 2, stockPending: 2 }],
  })
  assert.equal(demandas.length, 1)
  const [demanda] = demandas
  assert.equal(demanda.source, 'SALE_NO_STOCK')
  assert.equal(demanda.quantity, 2)
  assert.equal(demanda.orderId, 'order-1')
  assert.equal(demanda.dedupeKey, 'PEDIDO:order-1:prod-1:NEW')
  assert.equal(demanda.priority, 'NORMAL')
})

test('un pedido comprometido con fecha usa ORDER_COMMITTED y la prioridad de la promesa', () => {
  const [demanda] = demandasDePedido({
    orderId: 'order-2',
    promisedAt: new Date('2026-09-27T12:00:00.000Z'),
    items: [{ productId: 'prod-1', quantity: 1, serialsPending: 1 }],
    ahora: new Date('2026-09-26T12:00:00.000Z'),
  })
  assert.equal(demanda.source, 'ORDER_COMMITTED')
  assert.equal(demanda.priority, 'ALTA')
  assert.equal(demanda.promisedAt?.toISOString(), '2026-09-27T12:00:00.000Z')
})

test('la venta que superó el stock genera QUANTITY_OVER_STOCK por el faltante', () => {
  const [demanda] = demandasDePedido({
    orderId: 'order-3',
    items: [{ productId: 'prod-2', quantity: 3, stockFaltante: 2 }],
  })
  assert.equal(demanda.source, 'QUANTITY_OVER_STOCK')
  assert.equal(demanda.quantity, 2)
  assert.match(demanda.notes || '', /superó el stock/i)
})

test('un pedido cubierto no genera demanda', () => {
  assert.deepEqual(demandasDePedido({ orderId: 'order-4', items: [{ productId: 'prod-1', quantity: 1 }] }), [])
})

test('la reserva sin unidad genera RESERVATION_NO_STOCK solo por la diferencia', () => {
  const demanda = demandaDeReserva({ productId: 'prod-3', branchId: 'branch-1', faltante: 2, customerName: 'Ana', reservedUntil: '2026-09-26T18:00:00.000Z' })
  assert.ok(demanda)
  assert.equal(demanda.source, 'RESERVATION_NO_STOCK')
  assert.equal(demanda.quantity, 2)
  assert.match(demanda.dedupeKey, /^RESERVA:prod-3:NEW:branch-1:ana:/)
  assert.equal(demanda.priority, 'ALTA', 'una reserva que vence en horas es prioritaria')
  assert.equal(demandaDeReserva({ productId: 'prod-3', faltante: 0 }), null)
})

test('bajo el punto de reposición repone hasta el punto (una vez por semana)', () => {
  const ahora = new Date('2026-09-26T12:00:00.000Z')
  const demanda = demandaBajoMinimo({ productId: 'prod-4', branchId: 'branch-1', stock: 2, reorderPoint: 5, ahora })
  assert.ok(demanda)
  assert.equal(demanda.source, 'BELOW_REORDER')
  assert.equal(demanda.quantity, 4, 'reponer 5 - 2 + 1')
  assert.equal(demanda.dedupeKey, `MINIMO:prod-4:NEW:branch-1:${semanaClave(ahora)}`)
  assert.equal(demandaBajoMinimo({ productId: 'prod-4', stock: 8, reorderPoint: 5, ahora }), null)
  assert.equal(demandaBajoMinimo({ productId: 'prod-4', stock: 0, reorderPoint: null, ahora }), null)
})

test('el centro de compra acepta los del plan y códigos nuevos cortos', () => {
  assert.deepEqual(normalizarCentro('cde'), { ok: true, centro: 'CDE' })
  assert.deepEqual(normalizarCentro('USA'), { ok: true, centro: 'USA' })
  assert.deepEqual(normalizarCentro('PY02'), { ok: true, centro: 'PY02' })
  assert.deepEqual(normalizarCentro(''), { ok: true, centro: null })
  assert.deepEqual(normalizarCentro('C'), { ok: false, error: 'El centro de compra no es válido (2 a 8 letras o números).' })
  assert.equal(normalizarCentro('CON ESPACIO').ok, false)
})

// ── La tarjeta sabe que hay cliente aunque el nombre no viaje ───────────────
const [grupo] = consolidarNecesidades([
  { id: 'n1', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: null },
])
assert.equal(grupo.destinos[0]?.clienteOculto, true, 'sin permiso, la tarjeta marca el cliente oculto')
const [visible] = consolidarNecesidades([
  { id: 'n2', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: 'Juan Pérez' },
])
assert.equal(visible.destinos[0]?.clienteOculto, false, 'con el nombre visible no se marca oculto')
const [sinCliente] = consolidarNecesidades([
  { id: 'n3', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', sucursalId: 'b1', sucursal: 'Casa Central' },
])
assert.equal(sinCliente.destinos[0]?.clienteOculto, false, 'una reposición sin cliente no marca oculto')

console.log('supply-demand: venta/reserva → necesidad y cliente con permiso OK')
