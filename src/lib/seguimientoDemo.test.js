import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { codificarSeguimientoDemo, enlaceSeguimientoDemo, franjaEstadoPedidoDemo, leerSeguimientoDemo, MAX_FRAGMENTO_DEMO } from './seguimientoDemo.js'

const pedido = (n = 2) => ({
  id: 'v-1',
  orderNumber: 'AUR-0007',
  createdAt: '2026-10-20T14:00:00.000Z',
  fulfillmentStatus: 'READY_FOR_PICKUP',
  deliveryType: 'RETIRO',
  totalPyg: 4500000,
  totalPagado: 1000000,
  tenant: { name: 'MobOS Demo' },
  customer: { name: 'Lucía Real', phone: '0981123456', email: 'lucia@example.com' },
  items: Array.from({ length: n }, (_, i) => ({ description: `iPhone 15 Pro Max 256 GB Titanio ${i + 1}`, quantity: 1, unitPricePyg: 4500000 / n, totalPyg: 4500000 / n })),
})

test('el resumen vuelve completo y sin datos personales', () => {
  const codigo = codificarSeguimientoDemo(pedido())
  const datos = leerSeguimientoDemo(`#d=${codigo}`)
  assert.equal(datos.orderNumber, 'AUR-0007')
  assert.equal(datos.totalPyg, 4500000)
  assert.equal(datos.totalPagado, 1000000)
  assert.equal(datos.company.name, 'MobOS Demo')
  assert.equal(datos.tracking.estado, 'READY_FOR_PICKUP')
  assert.equal(datos.items.length, 2)
  assert.doesNotMatch(Buffer.from(codigo, 'base64url').toString(), /Lucía|0981|lucia@/)
})

test('un pedido grande recorta ítems con «+N más» y entra en el límite', () => {
  const codigo = codificarSeguimientoDemo(pedido(40))
  assert.ok(codigo.length <= MAX_FRAGMENTO_DEMO, `largo ${codigo.length}`)
  const datos = leerSeguimientoDemo(`#d=${codigo}`)
  assert.match(datos.items.at(-1).description, /^\+\d+ más$/)
  assert.equal(datos.totalPyg, 4500000)
})

test('el enlace usa un token demo y entrada inválida da null', () => {
  assert.match(enlaceSeguimientoDemo('https://x.test', pedido(), 'demo-rapido-v-1'), /^https:\/\/x\.test\/pedidos\/demo-rapido-v-1#d=/)
  assert.equal(leerSeguimientoDemo(''), null)
  assert.equal(leerSeguimientoDemo('#d=%%%'), null)
  assert.equal(leerSeguimientoDemo('#d=e30'), null)
})

test('el pedido demo sobre pedido muestra la franja «Estado de tu pedido» en el enlace público', () => {
  const sobrePedido = { ...pedido(1), items: [{ description: 'iPhone 17 Pro', quantity: 1, unitPricePyg: 9000000, totalPyg: 9000000, backorder: true }], promisedAt: '2026-10-30T12:00:00.000Z' }
  const franja = leerSeguimientoDemo(`#d=${codificarSeguimientoDemo(sobrePedido)}`).estadoPedido
  assert.equal(franja.estado, 'PENDIENTE_COMPRA')
  assert.equal(franja.titulo, 'Sobre pedido · llega aprox. 30/10')
  assert.equal(franja.detalle, 'Estamos consiguiendo tu producto.')
  // Un pedido común no muestra franja.
  assert.equal(leerSeguimientoDemo(`#d=${codificarSeguimientoDemo(pedido())}`).estadoPedido, null)
})

test('la franja del pedido demo recorre en camino, listo para retirar y entregado', () => {
  assert.equal(franjaEstadoPedidoDemo('EN_CAMINO', '2026-10-30T12:00:00.000Z').titulo, 'En camino')
  assert.equal(franjaEstadoPedidoDemo('LLEGO').titulo, 'Listo para retirar')
  assert.equal(franjaEstadoPedidoDemo('ENTREGADO').titulo, 'Entregado')
  assert.equal(franjaEstadoPedidoDemo('XX'), null)
})
