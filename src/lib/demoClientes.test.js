// #160/#194: en la demo, la venta del POS entra en la ficha del cliente y el
// CRM recalcula la actividad y los agregados (#221) como la cuenta real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDemoProfile, buildDemoTimeline, buscarClienteDemo, demoCuentaPayload, demoVitrinaPayload, eventosInformeDemo, filaInformeDemo, filasInformeDemo, listarClientesDemo, registrarInformeDemo, registrarInteraccionDemo, registrarPedidoDemoDeVenta, registrarVistoInformeDemo } from './demoClientes.js'
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

test('la interacción demo queda en la cronología del cliente (#240)', () => {
  const evento = registrarInteraccionDemo(LUCIA, { accion: 'Informe del equipo compartido', detalle: 'Por WhatsApp · serial 3567…678' })
  assert.ok(evento?.id)
  const timeline = buscarClienteDemo(LUCIA).demoProfile.timeline || []
  assert.equal(timeline[0].action, 'Informe del equipo compartido')
  assert.match(timeline[0].detail, /Por WhatsApp/)
  assert.equal(registrarInteraccionDemo('demo-cliente-inexistente', { accion: 'x' }), null)
})

test('el informe compartido en la demo muestra visto/no visto y su cronología (#240)', () => {
  // Seed visible: Lucía ya abrió el informe de su iPhone; la cronología lo
  // deriva de la fila de seguimiento (sobrevive a re-renderizar la ficha).
  const fila = filaInformeDemo('356789012345678')
  assert.equal(fila.customerId, LUCIA)
  assert.ok(fila.sharedAt && fila.firstViewedAt, 'el seed de Lucía ya está visto')
  const eventos = eventosInformeDemo(LUCIA)
  assert.ok(eventos.some((evento) => evento.action === 'Informe del equipo compartido' && /Por WhatsApp/.test(evento.detail)))
  assert.ok(eventos.some((evento) => evento.action === 'Informe del equipo visto por el cliente' && /Abierto desde el enlace de WhatsApp/.test(evento.detail)))
  const timeline = buildDemoTimeline(buscarClienteDemo(LUCIA))
  assert.ok(timeline.some((evento) => evento.action === 'Informe del equipo visto por el cliente'))
  // Y el ejemplo de «sin ver»: Ana tiene un informe compartido sin abrir.
  const sinVer = filasInformeDemo('demo-cliente-ana').find((row) => row.firstViewedAt === null && row.sharedAt)
  assert.ok(sinVer, 'falta el ejemplo de informe sin ver')
  const perfil = buildDemoProfile(buscarClienteDemo('demo-cliente-ana'))
  assert.ok(perfil.deviceReportShares.some((row) => row.serial === sinVer.serial))
})

test('compartir y abrir el informe en la demo mueve la fila de sin ver a visto (#240)', () => {
  const SERIAL = 'demo-serial-seguimiento-1'
  const sinFila = 'demo-serial-seguimiento-0'
  assert.equal(filaInformeDemo(SERIAL), null)
  const compartido = registrarInformeDemo('demo-cliente-ana', { serial: SERIAL.toLowerCase(), canal: 'EMAIL' })
  assert.equal(compartido.serial, SERIAL.toUpperCase(), 'el serial se normaliza a mayúsculas')
  assert.ok(compartido.sharedAt)
  assert.equal(compartido.firstViewedAt, null)
  assert.equal(filaInformeDemo(SERIAL).channel, 'EMAIL')
  assert.ok(eventosInformeDemo('demo-cliente-ana').some((evento) => evento.action === 'Informe del equipo compartido' && /Por correo/.test(evento.detail)))
  // Primera apertura: visto + evento; la segunda solo suma al contador.
  const visto = registrarVistoInformeDemo(null, SERIAL)
  assert.ok(visto.firstViewedAt && visto.lastViewedAt)
  assert.equal(visto.viewCount, 1)
  assert.ok(eventosInformeDemo('demo-cliente-ana').some((evento) => evento.action === 'Informe del equipo visto por el cliente' && /Abierto desde el enlace del correo/.test(evento.detail)))
  const repetido = registrarVistoInformeDemo(null, SERIAL)
  assert.equal(repetido.firstViewedAt, visto.firstViewedAt)
  assert.equal(repetido.viewCount, 2)
  // Un reenvío posterior no cambia de dónde se abrió (origen congelado).
  registrarInformeDemo('demo-cliente-ana', { serial: SERIAL, canal: 'WHATSAPP' })
  const eventos = eventosInformeDemo('demo-cliente-ana')
  assert.ok(eventos.some((evento) => evento.action === 'Informe del equipo compartido' && /Por WhatsApp/.test(evento.detail)))
  assert.ok(eventos.some((evento) => /Abierto desde el enlace del correo/.test(evento.detail)))
  assert.ok(!eventos.some((evento) => /Abierto desde el enlace de WhatsApp/.test(evento.detail)))
  // Un serial sin dueño no se marca (mismo criterio que el API público).
  assert.equal(registrarVistoInformeDemo(null, sinFila), null)
  assert.equal(filaInformeDemo(sinFila), null)
  // El certificado embebible (#240 §3, con INV) deja su propio origen.
  const embebido = registrarVistoInformeDemo('demo-cliente-ana', 'demo-serial-embebible', { canal: 'EMBED' })
  assert.equal(embebido.viewChannel, 'EMBED')
  assert.ok(eventosInformeDemo('demo-cliente-ana').some((evento) => /certificado embebido/.test(evento.detail)))
  // Abrir un equipo del portal sin envío previo deja el canal vacío.
  const segundoSerial = buscarClienteDemo('demo-cliente-ana').demoProfile.orders.flatMap((order) => (order.items || []).flatMap((item) => item.serials || []))[1]
  assert.ok(segundoSerial, 'Ana tiene más de un equipo con serial')
  const portal = registrarVistoInformeDemo('demo-cliente-ana', segundoSerial)
  assert.equal(portal.channel, null)
  assert.ok(eventosInformeDemo('demo-cliente-ana').some((evento) => /Abierto desde el portal del cliente/.test(evento.detail)))
})

test('el servicio técnico demo llega a la ficha, la cronología y el portal (#240 §4)', () => {
  // Ficha: las órdenes del taller del cliente con su estado.
  const perfil = buildDemoProfile(buscarClienteDemo(LUCIA))
  const servicio = perfil.serviceOrders.find((row) => row.id === 'demo-os-1')
  assert.ok(servicio, 'la ficha demo trae la orden del taller')
  assert.equal(servicio.status, 'LISTO')
  assert.ok(servicio.receivedAt)
  // Cronología: ingreso y entrega derivados de la orden.
  const eventosLucia = buildDemoTimeline(buscarClienteDemo(LUCIA)).filter((evento) => evento.type === 'service')
  assert.ok(eventosLucia.some((evento) => evento.action === 'Equipo en taller' && /iPhone 12/.test(evento.detail)))
  const entregado = buildDemoTimeline(buscarClienteDemo('demo-cliente-carlos')).find((evento) => evento.action === 'Equipo entregado')
  assert.ok(entregado, 'la orden entregada deja su evento de entrega')
  // Portal: estado y fechas, sin costos ni datos internos.
  const cuenta = demoCuentaPayload('demo-demo-cliente-lucia-rapido')
  const enPortal = cuenta.servicios.find((row) => row.serviceNumber === 'OS-0004')
  assert.ok(enPortal, 'el portal demo lista el servicio')
  assert.equal(enPortal.statusLabel, 'Listo para retirar')
  assert.equal(enPortal.device, 'iPhone 12 · 128 GB')
  assert.ok(!('pricePyg' in enPortal) && !('costPyg' in enPortal) && !('notes' in enPortal), 'el portal no expone datos internos')
})

test('el portal demo muestra la garantía con su credencial y la etapa del taller (#240)', () => {
  const cuenta = demoCuentaPayload('demo-demo-cliente-lucia-completo')
  const garantia = (cuenta.warranties || []).find((row) => row.serial === '356789012345678')
  assert.ok(garantia, 'el nivel completo lista la garantía de Lucía')
  assert.equal(garantia.publicToken, 'demo-garantia-lucia', 'la garantía trae su credencial')
  assert.ok(garantia.daysRemaining > 0)
  // El caso de Fernando derivó en una orden de taller: la garantía muestra la
  // etapa sin duplicar la sección de servicio.
  const fer = demoCuentaPayload('demo-demo-cliente-fernando-completo')
  const garantiaFer = (fer.warranties || []).find((row) => row.publicToken === 'demo-garantia-fernando')
  assert.ok(garantiaFer, 'Fernando tiene su garantía')
  assert.equal(garantiaFer.taller.statusLabel, 'Diagnóstico')
  // El nivel rápido no expone garantías (mismo contrato que el API).
  const rapido = demoCuentaPayload('demo-demo-cliente-fernando-rapido')
  assert.equal(rapido.warranties, undefined)
})

test('el portal demo sigue la entrega con sus pasos (#240 → portal)', () => {
  const cuenta = demoCuentaPayload('demo-demo-cliente-lucia-rapido')
  const pedido = cuenta.orders.find((row) => row.orderNumber === 'MOB-0008')
  assert.ok(pedido, 'Lucía tiene su pedido en la cuenta')
  assert.equal(pedido.fulfillmentStatus, 'IN_TRANSIT')
  assert.equal(pedido.tracking.encabezado, 'Seguimiento de envío')
  assert.equal(pedido.tracking.pasos.length, 5)
  const actual = pedido.tracking.pasos.find((paso) => paso.actual)
  assert.equal(actual.key, 'IN_TRANSIT')
  assert.equal(actual.label, 'En camino al cliente')
  assert.ok(actual.at, 'el paso actual trae fecha')
  assert.equal(pedido.tracking.pasos.filter((paso) => paso.hecho).length, 4)
  // El otro flujo: un retiro listo para retirar en el local.
  const carlos = demoCuentaPayload('demo-demo-cliente-carlos-rapido')
  const retiro = carlos.orders.find((row) => row.orderNumber === 'MOB-0004')
  assert.equal(retiro.tracking.encabezado, 'Seguimiento de retiro')
  assert.equal(retiro.tracking.pasos.find((paso) => paso.actual).label, 'Listo para retirar')
  // Una venta del mostrador sale entregada: no le quedan pasos pendientes.
  const venta = registrarPedidoDemoDeVenta(LUCIA, { numero: `AUR-${Date.now().toString(36).toUpperCase()}`, total: 500000, pagado: 500000, items: [{ description: 'Funda demo', quantity: 1 }] })
  const cuentaVenta = demoCuentaPayload('demo-demo-cliente-lucia-rapido')
  const pedidoVenta = cuentaVenta.orders.find((row) => row.orderNumber === venta.orderNumber)
  assert.equal(pedidoVenta.fulfillmentStatus, 'PICKED_UP')
  assert.equal(pedidoVenta.tracking.pasos.every((paso) => paso.hecho), true)
})
