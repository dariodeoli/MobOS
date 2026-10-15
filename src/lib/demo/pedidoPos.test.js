import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateCheckout } from '../../utils/checkout.js'
import { totalesPedido } from '../../utils/pedido.js'
import { pedidoPosDemo, stockDePedidoDemo } from './pedidoPos.js'

const productos = [{ id: 'funda', nombre: 'Funda', precioCosto: 50000, comision: 1000 }, { id: 'iphone', nombre: 'iPhone', precioCosto: 3900000, comision: 20000 }]
test('#487 un pedido multítem conserva total, pago parcial y snapshots de costo', () => {
 const lineas = allocateCheckout([{ productoId: 'funda', precio: 180000 }, { productoId: 'iphone', precio: 4850000, serials: ['QA7609'] }], 0, 0, [{ monto: 1000000 }])
 const venta = pedidoPosDemo(lineas, productos)
 const totales = totalesPedido({ ...venta, pagos: [{ monto: 1000000 }] })
 assert.deepEqual(venta.items.map(i => i.totalPyg), [180000, 4850000])
 assert.equal(venta.precioCosto, 3950000); assert.equal(venta.comision, 21000)
 assert.deepEqual(venta.items[1].serials, ['QA7609'])
 assert.equal(totales.total, 5030000); assert.equal(totales.pagado, 1000000)
 assert.equal(totales.pendiente, 4030000); assert.equal(totales.estado, 'Parcial')
})
test('#487 descuento y delivery se cuentan una sola vez con cantidades expandidas', () => {
 const venta = pedidoPosDemo(allocateCheckout([{ productoId: 'funda', precio: 180000 }, { productoId: 'funda', precio: 180000 }], 10001, 30000, [{ monto: 100000 }]), productos)
 assert.equal(venta.items.length, 2); assert.equal(venta.subtotalPyg, 360000)
 assert.equal(venta.precio, 349999); assert.equal(venta.totalPyg, 379999)
 assert.equal(venta.descuento, 10001); assert.equal(venta.montoDelivery, 30000)
 assert.equal(venta.precioCosto, 100000)
 assert.deepEqual(stockDePedidoDemo(venta), [{ productoId: 'funda', quantity: 1 }, { productoId: 'funda', quantity: 1 }])
})
test('#487 stock respeta cantidades, sobrepedido y la venta legacy', () => {
 assert.deepEqual(stockDePedidoDemo({ items: [{ productId: 'funda', quantity: 3 }, { productoId: 'iphone', quantity: 1, backorder: true }] }), [{ productoId: 'funda', quantity: 3 }])
 assert.deepEqual(stockDePedidoDemo({ productoId: 'funda' }), [{ productoId: 'funda', quantity: 1 }])
})

test('#487 sobrepedido descarta una selección de IMEI previa y no descuenta stock', () => {
 const venta = pedidoPosDemo([{ productoId: 'iphone', precio: 4850000, sobrePedido: true, serials: ['QA-SELECCION-ANTERIOR'] }], productos)
 assert.deepEqual(venta.items[0].serials, [])
 assert.deepEqual(stockDePedidoDemo(venta), [])
})
