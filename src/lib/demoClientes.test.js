// #160/#194: en la demo, la venta del POS entra en la ficha del cliente y el
// CRM recalcula la actividad y los agregados (#221) como la cuenta real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarClienteDemo, demoCuentaPayload, demoVitrinaPayload, listarClientesDemo, registrarPedidoDemoDeVenta } from './demoClientes.js'
import { analiticaDePedidos, statsDePedidos } from './customerAggregates.js'

const LUCIA = 'demo-cliente-lucia'

test('la cartera demo incluye los seeds aunque no se haya creado nada', () => {
  const cartera = listarClientesDemo()
  assert.ok(cartera.length >= 3)
  assert.ok(cartera.some((row) => row.id === LUCIA))
})

test('una venta demo entra en la ficha del cliente y mueve sus agregados', () => {
  const antes = statsDePedidos(buscarClienteDemo(LUCIA).demoProfile.orders)
  const analiticaAntes = analiticaDePedidos(buscarClienteDemo(LUCIA).demoProfile.orders)
  const pedido = registrarPedidoDemoDeVenta(LUCIA, {
    numero: 'AUR-0099',
    total: 1000000,
    pagado: 400000,
    fecha: new Date().toISOString(),
    vendedor: 'Diego López',
    sucursal: 'Casa Central',
    items: [{ description: 'Funda Silicona Negra', quantity: 1, model: 'Funda', category: 'Accesorios' }],
  })
  assert.equal(pedido.orderNumber, 'AUR-0099')
  assert.equal(pedido.totalPyg, 1000000)
  assert.equal(pedido.collectedPyg, 400000)
  assert.equal(pedido.pendingPyg, 600000)
  const despues = statsDePedidos(buscarClienteDemo(LUCIA).demoProfile.orders)
  assert.equal(despues.orders, antes.orders + 1)
  assert.equal(despues.totalSpentPyg, antes.totalSpentPyg + 1000000)
  assert.equal(despues.lastOrderAt, pedido.createdAt)
  const analitica = analiticaDePedidos(buscarClienteDemo(LUCIA).demoProfile.orders)
  assert.equal(analitica.ordersCount, analiticaAntes.ordersCount + 1)
  assert.ok(analitica.topCategories.some((item) => item.category === 'Accesorios'))
})

test('la venta demo deja el evento en la cronología del cliente', () => {
  const cliente = buscarClienteDemo(LUCIA)
  const evento = (cliente.demoProfile.timeline || []).find((item) => /Pedido creado/.test(item.action))
  assert.ok(evento, 'el pedido nuevo suma un evento a la cronología')
  assert.match(evento.detail, /AUR-#0099/)
})

test('un cliente inexistente no registra nada', () => {
  assert.equal(registrarPedidoDemoDeVenta('demo-cliente-inexistente', { total: 1000 }), null)
})

test('cada cliente demo completa el perfil de §19 (tipo, impuestos, tags, direcciones, antigüedad, gastado)', () => {
  const cartera = listarClientesDemo()
  for (const cliente of cartera) {
    const stats = statsDePedidos(cliente.demoProfile?.orders || [])
    assert.ok(cliente.name, 'cliente sin nombre')
    assert.ok(cliente.createdAt, `${cliente.name} sin fecha de alta (antigüedad)`)
    assert.ok(cliente.document, `${cliente.name} sin RUC/CI`)
    assert.ok(Array.isArray(cliente.tags) && cliente.tags.length > 0, `${cliente.name} sin etiquetas`)
    assert.ok(Array.isArray(cliente.addresses) && cliente.addresses.length > 0, `${cliente.name} sin direcciones`)
    assert.ok(['RETAIL', 'WHOLESALE'].includes(cliente.pricingTier), `${cliente.name} sin tipo de cliente`)
    assert.equal(typeof cliente.taxExempt, 'boolean', `${cliente.name} sin «paga impuestos»`)
    if (cliente.pricingTier === 'WHOLESALE') assert.equal(cliente.taxExempt, false, `${cliente.name} es mayorista con RUC y no puede estar exento`)
    assert.ok(stats.orders > 0 && stats.totalSpentPyg > 0, `${cliente.name} sin compras para gastado/órdenes`)
  }
  assert.ok(cartera.some((cliente) => cliente.addresses.length > 1), 'falta un cliente con direcciones adicionales')
  assert.ok(cartera.some((cliente) => cliente.pricingTier === 'WHOLESALE' && cliente.document), 'falta un mayorista con RUC')
})

test('el portal demo sale como Aurora Móviles y con la nota pública', () => {
  const cuenta = demoCuentaPayload('demo-demo-cliente-lucia-rapido')
  assert.equal(cuenta.company.name, 'Aurora Móviles')
  assert.match(cuenta.customer.publicNote || '', /Aurora Móviles/)
  const vitrina = demoVitrinaPayload('demo-demo-cliente-lucia-completo')
  assert.equal(vitrina.tienda.nombre, 'Aurora Móviles')
  assert.match(vitrina.cliente.notaPublica || '', /Aurora Móviles/)
})
