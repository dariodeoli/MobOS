// Venta sin stock · etiquetas, estado, pasos, filtros y la demo funcional.
const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

import test from 'node:test'
import assert from 'node:assert/strict'
import { contarVentas, estadoDelPedido, estadoSobrePedido, filtrarVentas, siguientePaso, tituloParaCliente, plazoPrometido } from './ventaSinStock.js'

const demo = await import('./demo/ventaSinStock.js')

test('el estado de la línea avanza de comprar a entregado', () => {
  assert.equal(estadoSobrePedido({ stockPending: 1, need: { status: 'ABIERTA', quantity: 1 } }), 'PENDIENTE_COMPRA')
  assert.equal(estadoSobrePedido({ stockPending: 1, need: { status: 'COMPRADA', quantity: 0 } }), 'COMPRADO')
  assert.equal(estadoSobrePedido({ stockPending: 1, need: { status: 'COMPRADA', quantity: 0 }, shipmentStatus: 'EN_TRANSITO' }), 'EN_CAMINO')
  assert.equal(estadoSobrePedido({ stockPending: 0, backorderArrivedAt: '2026-10-23T10:00:00Z' }), 'LLEGO')
  assert.equal(estadoSobrePedido({ stockPending: 0, backorderArrivedAt: '2026-10-23T10:00:00Z', entregado: true }), 'ENTREGADO')
  assert.equal(estadoSobrePedido({}), null)
  assert.equal(estadoDelPedido(['LLEGO', null, 'COMPRADO']), 'COMPRADO')
})

test('una sola acción principal por estado', () => {
  assert.equal(siguientePaso({ estado: 'PENDIENTE_COMPRA' }), 'COMPRAR')
  assert.equal(siguientePaso({ estado: 'COMPRADO', faltaCosto: true }), 'CARGAR_COSTO')
  assert.equal(siguientePaso({ estado: 'COMPRADO' }), 'MARCAR_PAGADO')
  assert.equal(siguientePaso({ estado: 'COMPRADO', pagado: true }), 'RECIBIDO')
  assert.equal(siguientePaso({ estado: 'EN_CAMINO', credito: true }), 'RECIBIDO')
  assert.equal(siguientePaso({ estado: 'LLEGO' }), 'AVISAR')
  assert.equal(siguientePaso({ estado: 'LLEGO', avisado: true }), 'ENTREGAR')
  assert.equal(siguientePaso({ estado: 'ENTREGADO' }), null)
})

test('lo que ve el cliente: sobre pedido con fecha, listo para retirar o entregar', () => {
  assert.equal(tituloParaCliente('PENDIENTE_COMPRA', { fechaPrometida: '2026-10-30T12:00:00Z' }), 'Sobre pedido · llega aprox. 30/10')
  assert.equal(tituloParaCliente('COMPRADO', { fechaPrometida: '2026-10-30T12:00:00Z', mostrarFecha: false }), 'Sobre pedido')
  assert.equal(tituloParaCliente('LLEGO'), 'Listo para retirar')
  assert.equal(tituloParaCliente('LLEGO', { entregaADomicilio: true }), 'Listo para entregar')
  assert.equal(plazoPrometido(null), null)
  assert.equal(plazoPrometido(new Date(Date.now() - 2 * 86400000).toISOString()).vencida, true)
})

test('filtros y contadores del panel, con «Sin costo»', () => {
  const lineas = [
    { producto: 'Funda', cliente: 'Ana', pedidoNumero: 'A-1', estado: 'PENDIENTE_COMPRA', faltaCosto: false },
    { producto: 'AirPods', cliente: 'Beto', pedidoNumero: 'A-2', estado: 'COMPRADO', faltaCosto: true },
    { producto: 'Cargador', cliente: 'Cami', pedidoNumero: 'A-3', estado: 'LLEGO', faltaCosto: false },
  ]
  assert.equal(filtrarVentas(lineas, 'todos').length, 3)
  assert.deepEqual(filtrarVentas(lineas, 'sin-costo').map((fila) => fila.producto), ['AirPods'])
  assert.deepEqual(filtrarVentas(lineas, 'LLEGO').map((fila) => fila.producto), ['Cargador'])
  assert.deepEqual(filtrarVentas(lineas, 'todos', 'a-2').map((fila) => fila.producto), ['AirPods'])
  assert.deepEqual(contarVentas(lineas), { todos: 3, 'sin-costo': 1, PENDIENTE_COMPRA: 1, COMPRADO: 1, EN_CAMINO: 0, LLEGO: 1, ENTREGADO: 0 })
})

test('demo funcional: comprar sin costo → costo → pagado → recibido → avisar', () => {
  const inicial = demo.listarVentasSinStockDemo().lineas
  const funda = inicial.find((fila) => fila.id === 'demo-ss-1')
  assert.equal(funda.estado, 'PENDIENTE_COMPRA')
  assert.equal(funda.siguientePaso, 'COMPRAR')
  assert.throws(() => demo.comprarSinStockDemo({ paymentCondition: 'CONTADO', yaPagado: true, lines: [{ needId: 'demo-ss-1', quantity: 2 }] }), /cargá primero el costo/)
  const compra = demo.comprarSinStockDemo({ supplierName: 'Importadora Tech', paymentCondition: 'CONTADO', lines: [{ needId: 'demo-ss-1', productId: funda.productoId, quantity: 2 }] })
  let fila = demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-1')
  assert.equal(fila.estado, 'COMPRADO')
  assert.equal(fila.faltaCosto, true)
  assert.equal(fila.siguientePaso, 'CARGAR_COSTO')
  assert.throws(() => demo.actualizarCompraSinStockDemo({ id: compra.id, action: 'markPaid' }), /Cargá primero el costo/)
  demo.actualizarCompraSinStockDemo({ id: compra.id, action: 'setCost', unitCostPyg: 25000 })
  fila = demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-1')
  assert.equal(fila.faltaCosto, false)
  assert.equal(fila.siguientePaso, 'MARCAR_PAGADO')
  assert.equal(fila.costoUnitarioPyg, 25000)
  const pago = demo.actualizarCompraSinStockDemo({ id: compra.id, action: 'markPaid', accountId: 'demo-cuenta' })
  assert.equal(pago.pago.conCuenta, true)
  assert.throws(() => demo.actualizarCompraSinStockDemo({ id: compra.id, action: 'markPaid', accountId: 'demo-cuenta' }), /ya está pagada/)
  assert.equal(demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-1').siguientePaso, 'RECIBIDO')
  const parcial = demo.recibirRapidoSinStockDemo({ needId: 'demo-ss-1', quantity: 1 })
  assert.deepEqual([parcial.aplicadas, parcial.restantes, parcial.llegoTodo], [1, 1, false])
  const resto = demo.recibirRapidoSinStockDemo({ needId: 'demo-ss-1', quantity: 9 })
  assert.deepEqual([resto.aplicadas, resto.restantes, resto.llegoTodo], [1, 0, true], 'tope en lo pendiente')
  assert.throws(() => demo.recibirRapidoSinStockDemo({ needId: 'demo-ss-1', quantity: 1 }), /ya no tiene unidades pendientes/)
  fila = demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-1')
  assert.equal(fila.estado, 'LLEGO')
  assert.equal(fila.siguientePaso, 'AVISAR')
  demo.avisarClienteDemo({ id: 'demo-ss-1' })
  assert.equal(demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-1').siguientePaso, 'ENTREGAR')
})

test('demo: el pago sin Finanzas queda «ya pagado» sin cuenta', () => {
  // La venta «AUR-0013» ya viene comprada sin costo en el seed de la demo.
  assert.equal(demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-2').faltaCosto, true)
  demo.actualizarCompraSinStockDemo({ id: 'demo-ss-compra-1', action: 'setCost', unitCostPyg: 700000 })
  const pago = demo.actualizarCompraSinStockDemo({ id: 'demo-ss-compra-1', action: 'markPaid' })
  assert.equal(pago.pago.pendienteDeCuenta, true)
  assert.equal(demo.listarVentasSinStockDemo().lineas.find((item) => item.id === 'demo-ss-2').pagoSinCuenta, true)
})
