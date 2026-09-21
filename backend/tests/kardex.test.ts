import assert from 'node:assert/strict'
import { construirKardex, eventosDeCompras, eventosDeDevolucionesProveedor, eventosDeProducto, eventosDeTransferencias, eventosDeUnidades, eventosDeVentas } from '../lib/kardex'
import type { KardexEvento } from '../lib/kardex'

const fecha = (texto: string) => new Date(`${texto}T12:00:00.000Z`)
const evento = (id: string, at: string, delta: number, kind: KardexEvento['kind'] = 'AJUSTE'): KardexEvento => ({ id, at: fecha(at), kind, label: id, detail: '', reference: null, user: null, delta })

// ── Saldo corrido ───────────────────────────────────────────────────────────
const vista = construirKardex([evento('a', '2026-09-01', 10, 'ALTA'), evento('b', '2026-09-02', -4, 'VENTA'), evento('c', '2026-09-03', 3, 'COMPRA')], 9)
assert.equal(vista.saldoInicial, 0)
assert.deepEqual(vista.movimientos.map(movimiento => [movimiento.id, movimiento.saldo]), [['a', 10], ['b', 6], ['c', 9]])
assert.equal(vista.cierre, 9)
assert.deepEqual(vista.totales, { entradas: 13, salidas: 4, neto: 9 })
assert.equal(vista.truncado, false)

// El saldo inicial absorbe lo que no tiene documento: el cierre nunca miente.
const conHueco = construirKardex([evento('a', '2026-09-01', 10, 'ALTA'), evento('b', '2026-09-02', -4, 'VENTA')], 12)
assert.equal(conHueco.saldoInicial, 6)
assert.equal(conHueco.cierre, 12)

// Rango de fechas: la vista arranca con el saldo a esa fecha.
const rango = construirKardex([evento('a', '2026-09-01', 10, 'ALTA'), evento('b', '2026-09-02', -4, 'VENTA'), evento('c', '2026-09-03', 3, 'COMPRA')], 9, { desde: fecha('2026-09-03'), limite: 10 })
assert.equal(rango.saldoInicial, 6)
assert.deepEqual(rango.movimientos.map(movimiento => movimiento.id), ['c'])
assert.equal(rango.cierre, 9)
assert.equal(rango.total, 3)

const acotado = construirKardex([evento('a', '2026-09-01', 10, 'ALTA'), evento('b', '2026-09-02', -4, 'VENTA'), evento('c', '2026-09-03', 3, 'COMPRA')], 9, { limite: 2 })
assert.deepEqual(acotado.movimientos.map(movimiento => movimiento.id), ['b', 'c'])
assert.equal(acotado.truncado, true)
assert.equal(acotado.saldoInicial, 0)

// ── Compras ─────────────────────────────────────────────────────────────────
const compras = eventosDeCompras([
  { id: 'l1', receivedQty: 5, lotReference: 'L-1', unitCostPyg: 1000, finalUnitCostPyg: 1200, purchase: { id: 'p1', supplierName: 'Proveedor', status: 'RECEIVED', createdAt: fecha('2026-09-01'), receivedAt: fecha('2026-09-04'), createdBy: { name: 'Ana' } } },
  { id: 'l2', receivedQty: 2, lotReference: null, unitCostPyg: 500, finalUnitCostPyg: 0, purchase: { id: 'p2', supplierName: 'Proveedor', status: 'PARTIAL', createdAt: fecha('2026-09-05'), receivedAt: null, createdBy: null } },
  { id: 'l3', receivedQty: 0, lotReference: null, unitCostPyg: 500, finalUnitCostPyg: 0, purchase: { id: 'p3', supplierName: 'Proveedor', status: 'DRAFT', createdAt: fecha('2026-09-06'), receivedAt: null, createdBy: null } },
], { costos: true })
assert.equal(compras.length, 2)
assert.equal(compras[0].delta, 5)
assert.equal(compras[0].at.getTime(), fecha('2026-09-04').getTime())
assert.match(compras[0].detail, /lote L-1 · Gs 1\.200 c\/u/)
assert.equal(compras[0].user, 'Ana')
assert.equal(compras[1].delta, 2)
assert.match(compras[1].label, /parcial/)
assert.equal(compras[1].at.getTime(), fecha('2026-09-05').getTime())
assert.match(compras[1].detail, /Gs 500 c\/u/)

// ── Ventas ──────────────────────────────────────────────────────────────────
const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', quantity: 3, serials: [], serialsPending: 0, unitPricePyg: 100000,
  order: { id: 'o1', orderNumber: 'P-1', status: 'COMPLETED', createdAt: fecha('2026-09-02'), customer: { name: 'Cliente' }, seller: { name: 'Vera' } }, ...extra,
})
const ventas = eventosDeVentas([pedido({ id: 'i1', quantity: 2, serials: ['AAA', 'BBB'], serialsPending: 0 })], new Map(), new Map(), { precios: true })
assert.equal(ventas.length, 1)
assert.equal(ventas[0].delta, -2)
assert.equal(ventas[0].at.getTime(), fecha('2026-09-02').getTime())
assert.match(ventas[0].detail, /Cliente · 2 unidades · Gs 100\.000/)

// Pedido "sobre pedido": lo pendiente no descontó stock todavía.
const pendiente = eventosDeVentas([pedido({ id: 'i2', quantity: 3, serials: [], serialsPending: 3 })], new Map(), new Map())
assert.equal(pendiente.length, 0)

// Entrega posterior de un IMEI: descuenta recién ahí.
const adjuntos = new Map([['i3', [{ itemId: 'i3', at: fecha('2026-09-04'), cantidad: 1, user: 'Vera' }]]])
const entregado = eventosDeVentas([pedido({ id: 'i3', quantity: 2, serials: ['CCC'], serialsPending: 0 })], adjuntos, new Map())
assert.deepEqual(entregado.map(movimiento => [movimiento.label, movimiento.delta, movimiento.at.toISOString().slice(0, 10)]), [
  ['Venta P-1', -1, '2026-09-02'],
  ['Entrega de IMEI · P-1', -1, '2026-09-04'],
])

// Anulación: la venta queda y la restitución la compensa.
const anulado = eventosDeVentas([pedido({ id: 'i4', quantity: 1, serials: ['DDD'], serialsPending: 0 })], new Map(), new Map([['o1', [{ orderId: 'o1', at: fecha('2026-09-05'), action: 'ORDER_VOIDED', restock: null, reference: 'no llegó', user: 'Dueño' }]]]))
assert.deepEqual(anulado.map(movimiento => [movimiento.kind, movimiento.delta, movimiento.estimated]), [['VENTA', -1, undefined], ['DEVOLUCION', 1, true]])

// Devolución con reposición a revisión: no vuelve al stock disponible.
const revision = eventosDeVentas([pedido({ id: 'i5', quantity: 1, serials: ['EEE'], serialsPending: 0 })], new Map(), new Map([['o1', [{ orderId: 'o1', at: fecha('2026-09-06'), action: 'ORDER_RETURN_RECORDED', restock: 'DEFECTIVE', reference: null, user: 'Dueño' }]]]))
assert.deepEqual(revision.map(movimiento => movimiento.delta), [-1])

// Devolución sin reposición: no genera movimiento.
const sinReposicion = eventosDeVentas([pedido({ id: 'i6', quantity: 1, serials: [], serialsPending: 0 })], new Map(), new Map([['o1', [{ orderId: 'o1', at: fecha('2026-09-06'), action: 'ORDER_RETURN_RECORDED', restock: 'NONE', reference: null, user: null }]]]))
assert.deepEqual(sinReposicion.map(movimiento => movimiento.delta), [-1])

// ── Transferencias ──────────────────────────────────────────────────────────
const transferencias = eventosDeTransferencias([
  { id: 't1', quantity: 2, serials: [], sourceProductId: 'origen', destinationProductId: 'destino', transfer: { id: 'tr1', createdAt: fecha('2026-09-07'), receivedAt: null, sourceBranch: { name: 'Centro' }, destinationBranch: { name: 'Shopping' } } },
  { id: 't2', quantity: 1, serials: ['FFF'], sourceProductId: 'destino', destinationProductId: 'otro', transfer: { id: 'tr2', createdAt: fecha('2026-09-08'), receivedAt: fecha('2026-09-09'), sourceBranch: { name: 'Shopping' }, destinationBranch: { name: 'Centro' } } },
  { id: 't3', quantity: 1, serials: ['GGG'], sourceProductId: 'tercero', destinationProductId: 'origen', transfer: { id: 'tr3', createdAt: fecha('2026-09-10'), receivedAt: null, sourceBranch: { name: 'Centro' }, destinationBranch: { name: 'Norte' } } },
], 'origen')
assert.deepEqual(transferencias.map(movimiento => [movimiento.id, movimiento.delta]), [
  ['transferencia-envio-t1', -2],
])
// La recepción serializada sin confirmar no suma stock.
assert.equal(transferencias.filter(movimiento => movimiento.id === 'transferencia-recibo-t3').length, 0)
const destino = eventosDeTransferencias([
  { id: 't1', quantity: 2, serials: [], sourceProductId: 'origen', destinationProductId: 'destino', transfer: { id: 'tr1', createdAt: fecha('2026-09-07'), receivedAt: null, sourceBranch: { name: 'Centro' }, destinationBranch: { name: 'Shopping' } } },
  { id: 't3', quantity: 1, serials: ['GGG'], sourceProductId: 'tercero', destinationProductId: 'destino', transfer: { id: 'tr3', createdAt: fecha('2026-09-10'), receivedAt: fecha('2026-09-11'), sourceBranch: { name: 'Centro' }, destinationBranch: { name: 'Norte' } } },
], 'destino')
assert.deepEqual(destino.map(movimiento => [movimiento.delta, movimiento.at.getTime()]), [[2, fecha('2026-09-07').getTime()], [1, fecha('2026-09-11').getTime()]])

// ── Devoluciones al proveedor y unidades ────────────────────────────────────
const devolucion = eventosDeDevolucionesProveedor([{ id: 'd1', quantity: 2, unitCostPyg: 1500, purchaseReturn: { id: 'pr1', createdAt: fecha('2026-09-12'), reason: 'fallado', purchase: { supplierName: 'Proveedor' } } }], { costos: true })
assert.equal(devolucion[0].delta, -2)
assert.match(devolucion[0].detail, /2 unidades · Proveedor · fallado · Gs 1\.500 c\/u/)
assert.equal(devolucion[0].reference, 'pr1')

const unidades = eventosDeUnidades([
  { id: 'u1', entityId: 'un1', action: 'INVENTORY_UNIT_RECEIVED', createdAt: fecha('2026-09-13'), metadata: { serial: 'HHH' }, user: { name: 'Ana' } },
  { id: 'u2', entityId: 'un1', action: 'INVENTORY_REMOVED', createdAt: fecha('2026-09-14'), metadata: { serial: 'HHH', reason: 'roto' }, user: { name: 'Ana' } },
  { id: 'u3', entityId: 'un1', action: 'INVENTORY_RESTORED', createdAt: fecha('2026-09-15'), metadata: { serial: 'HHH' }, user: { name: 'Dueño' } },
  { id: 'u4', entityId: 'un1', action: 'INVENTORY_UNIT_MOVED', createdAt: fecha('2026-09-16'), metadata: {}, user: null },
])
assert.deepEqual(unidades.map(movimiento => movimiento.delta), [1, -1, 1])
assert.match(unidades[1].detail, /roto/)

// ── Alta y ajuste manual ────────────────────────────────────────────────────
const producto = eventosDeProducto([
  { id: 'a1', action: 'PRODUCT_CREATED', createdAt: fecha('2026-09-01'), metadata: { stock: 4 }, user: null },
  { id: 'a2', action: 'PRODUCT_UPDATED', createdAt: fecha('2026-09-02'), metadata: { stock: 7, stockBefore: 4 }, user: { name: 'Dueño' } },
  { id: 'a3', action: 'PRODUCT_UPDATED', createdAt: fecha('2026-09-03'), metadata: { pricePyg: 1000, stock: 7 }, user: null },
  { id: 'a4', action: 'PRODUCT_UPDATED', createdAt: fecha('2026-09-04'), metadata: { stock: 9, stockBefore: 9 }, user: null },
])
assert.deepEqual(producto.map(evento => [evento.kind, evento.delta]), [['ALTA', 4], ['AJUSTE', 3]])

console.log('kardex.test.ts: ok')
