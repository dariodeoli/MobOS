// #324: coherencia global de los fixtures del demo. Recorre la MISMA fuente de
// verdad que usan las pantallas (ventas canónicas → ficha/portal, más
// proveedores, equipo, cola de impresión, cotizaciones, precios, kardex,
// reportes, abastecimiento, reparto y cronologías) y falla ante cualquier
// contradicción de las que reportó la auditoría.
// Todo lo que se importa acá es puro (sin storage/API) para correr en node.
import test from 'node:test'
import assert from 'node:assert/strict'

// La pestaña demo se simula ANTES de importar los módulos que la detectan.
const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = {
  location: { pathname: '/demo' },
  addEventListener: () => {},
  dispatchEvent: () => {},
}

const { ventasDemoLegacy, pedidosDemoDeCliente } = await import('./ventas.js')
const { PROVEEDORES_DEMO } = await import('./proveedores.js')
const { EQUIPO_DEMO, IPHONES_DEMO } = await import('./iphones.js')
const { PERFILES_DEMO, perfilDemo, perfilDemoPorPin } = await import('./equipo.js')
const { ROLE_ORDER } = await import('../roles.js')
const { demoSessionRole, saveDemoSession } = await import('../demoMode.js')
const { colaDemo } = await import('../printing/demo.js')
const { COTIZACIONES_DEMO, listDemoQuotes } = await import('./cotizaciones.js')
const { listDemoPriceLists, pricingDemo } = await import('./precios.js')
const { reporteDemoMetricas } = await import('./reportes.js')
const { listDemoSupplyNeeds, listDemoSupplyPurchases, demoSupplyPurchaseLabels, listDemoSupplyShipments, demoSupplyAlerts, demoSupplyPerformance, demoSupplySerial } = await import('./abastecimiento.js')
const { sistemaDemo } = await import('./sistema.js')
const { historialDemo } = await import('./historial.js')
const { plantillasDemo } = await import('./plantillas.js')
const { listarClientesDemo, buildDemoAnalytics } = await import('../demoClientes.js')
const { analiticaDePedidos } = await import('../customerAggregates.js')
const { listDemoDeliveryOrdersDelRepartidor, listDemoDeliverySettlementsDelRepartidor, registrarCobroRepartoDemo, REPARTIDOR_DEMO_ID } = await import('./delivery.js')
const { DEMO_PURCHASES } = await import('./compras.js')

const legacy = ventasDemoLegacy()

test('#324 · cada venta canónica es un pedido completo (sin Gs 0 ni artículos vacíos)', () => {
  assert.ok(legacy.length >= 15, 'el seed conserva la cartera de ventas')
  for (const venta of legacy) {
    assert.ok(venta.items.length > 0, `${venta.id} sin artículos`)
    assert.equal(venta.items.reduce((suma, item) => suma + item.totalPyg, 0), venta.precio, `${venta.id}: las líneas suman el subtotal`)
    for (const item of venta.items) {
      assert.ok(item.totalPyg > 0, `${venta.id}: línea en Gs 0`)
      assert.equal(item.totalPyg, item.quantity * item.unitPricePyg, `${venta.id}: cantidad × precio`)
      assert.ok(item.description && item.category, `${venta.id}: línea sin descripción/categoría`)
    }
    assert.equal(venta.totalPyg, venta.precio + venta.montoDelivery, `${venta.id}: total con delivery`)
    for (const pago of venta.pagos) assert.equal(pago.amountPyg, pago.monto, `${venta.id}: amountPyg espeja monto`)
    assert.equal(venta.totalPagado, venta.pagos.reduce((suma, pago) => suma + pago.monto, 0), `${venta.id}: pagos suman lo cobrado`)
    assert.equal(venta.totalPendiente, Math.max(0, venta.totalPyg - venta.totalPagado), `${venta.id}: pendiente coherente`)
    assert.match(venta.orderNumber, /^AUR-\d{4}$/, `${venta.id}: número visible`)
    assert.equal(venta.tenant?.name, 'Aurora Móviles S.A.', `${venta.id}: comprobante con la empresa ficticia`)
    assert.ok(venta.customer?.name, `${venta.id}: comprobante con cliente`)
    assert.ok(venta.branch?.name && venta.seller?.name, `${venta.id}: sucursal y vendedor`)
  }
  const del180 = legacy.find((venta) => venta.totalPyg === 180000 && venta.cliente === 'Carlos Benítez')
  assert.ok(del180 && del180.items.length === 1, 'el pedido de Gs 180.000 trae su artículo')
})

test('#324 · la ficha de cada cliente cuadra con la misma venta y sin «30 compras/mes»', () => {
  const cartera = listarClientesDemo()
  assert.ok(cartera.length >= 14)
  const porId = new Map(legacy.map((venta) => [venta.clienteId, venta]))
  for (const cliente of cartera) {
    const pedidos = cliente.demoProfile?.orders || []
    assert.ok(pedidos.length > 0, `${cliente.name} sin pedidos`)
    for (const pedido of pedidos) {
      assert.ok(pedido.items?.length > 0, `${cliente.name}: pedido ${pedido.orderNumber} sin líneas`)
      for (const item of pedido.items) assert.ok(item.totalPyg > 0, `${cliente.name}: favorito en Gs 0`)
    }
    const analitica = buildDemoAnalytics(cliente)
    assert.ok(analitica.purchasesPerMonth <= analitica.ordersCount, `${cliente.name}: ritmo imposible`)
    if (analitica.ordersCount <= 1) assert.ok(analitica.purchasesPerMonth <= 1, `${cliente.name}: una compra no es 30/mes`)
    if (porId.has(cliente.id)) {
      assert.ok(pedidos.some((pedido) => pedido.orderNumber === porId.get(cliente.id).orderNumber), `${cliente.name}: la venta del POS está en su ficha`)
      assert.equal(analitica.totalPyg >= porId.get(cliente.id).totalPyg, true, `${cliente.name}: agregados incluyen la venta`)
    }
  }
  // El caso puntual de la auditoría: un cliente con una sola compra no
  // extrapola un ritmo mensual irreal.
  const unaSola = analiticaDePedidos([{ orderNumber: 'X', totalPyg: 100, status: 'COMPLETED', createdAt: new Date().toISOString(), items: [] }])
  assert.equal(unaSola.purchasesPerMonth, 1)
})

test('#324 · la ficha del cliente expone la misma venta canónica que el POS', () => {
  for (const venta of legacy) {
    const pedidos = pedidosDemoDeCliente(venta.clienteId)
    const mismo = pedidos.find((pedido) => pedido.orderNumber === venta.orderNumber)
    assert.ok(mismo, `${venta.clienteId}: falta ${venta.orderNumber}`)
    assert.equal(mismo.totalPyg, venta.totalPyg)
    assert.equal(mismo.collectedPyg, venta.totalPagado)
    assert.equal(mismo.pendingPyg, venta.totalPendiente)
    assert.equal(mismo.items.reduce((suma, item) => suma + item.totalPyg, 0), venta.precio)
  }
})

test('#324 · proveedores unificados en Compras y Abastecimiento', () => {
  const nombres = new Set(PROVEEDORES_DEMO.map((proveedor) => proveedor.name))
  const ids = new Set(PROVEEDORES_DEMO.map((proveedor) => proveedor.id))
  assert.ok(PROVEEDORES_DEMO.length >= 3)
  assert.ok(PROVEEDORES_DEMO.every((proveedor) => /^[A-Z]{3,8}$/.test(proveedor.code)), 'cada proveedor tiene abreviatura')
  for (const compra of DEMO_PURCHASES) {
    assert.ok(ids.has(compra.supplierId), `${compra.id}: proveedor del catálogo`)
    assert.equal(nombres.has(compra.supplierName), true, `${compra.id}: nombre visible unificado`)
    assert.ok(!/Proveedor (Sur|Norte)/.test(compra.supplierName), 'sin proveedores genéricos de la auditoría')
    const totalLineas = compra.lines.reduce((suma, linea) => suma + linea.finalTotalCostPyg, 0)
    assert.ok(compra.finalCostPyg >= totalLineas, `${compra.id}: el costo final cubre las líneas`)
  }
  const comprasCentro = listDemoSupplyPurchases().compras
  for (const compra of comprasCentro) {
    assert.ok(ids.has(compra.supplierId), `${compra.code}: proveedor del catálogo`)
    assert.equal(nombres.has(compra.supplierName), true, `${compra.code}: nombre visible unificado`)
  }
})

test('#324 · los seis roles demo existen, tienen PIN único y la sesión dice lo mismo que Equipo', () => {
  const rolesDelEquipo = new Set(EQUIPO_DEMO.map((persona) => persona.rol))
  for (const rol of ROLE_ORDER) assert.ok(rolesDelEquipo.has(rol), `falta el rol ${rol}`)
  const pines = new Set(EQUIPO_DEMO.map((persona) => persona.pin))
  assert.equal(pines.size, EQUIPO_DEMO.length, 'PINs únicos')
  assert.deepEqual(PERFILES_DEMO.map((perfil) => perfil.rol), ROLE_ORDER)
  for (const perfil of PERFILES_DEMO) {
    const persona = perfilDemoPorPin(perfil.pin)
    assert.ok(persona, `PIN ${perfil.pin} resuelve`)
    assert.equal(persona.rol, perfil.rol, `PIN ${perfil.pin}: mismo rol que Equipo`)
    assert.equal(persona.nombre, perfil.persona)
  }
  assert.equal(perfilDemo('ADMIN').id, 'demo-user')
  assert.equal(perfilDemo('VENDEDOR').id, 'demo-user-vendedor')
  for (const rol of ROLE_ORDER) {
    saveDemoSession(rol)
    assert.equal(demoSessionRole(), rol, `la recarga conserva el rol ${rol}`)
  }
})

test('#324 · la cola de impresión demo lista la misma cantidad que la cabecera', () => {
  const cola = colaDemo()
  assert.equal(cola.pendientes.length, 2, 'dos trabajos esperando, como muestra el modal')
  assert.equal(cola.inciertos.length, 1)
  assert.equal(cola.fallidos.length, 1)
})

test('#324 · cotizaciones y plantillas cubren el pipeline y el taller', () => {
  const estados = new Set(COTIZACIONES_DEMO.map((fila) => fila.status))
  for (const estado of ['DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED']) assert.ok(estados.has(estado), estado)
  for (const fila of listDemoQuotes()) {
    assert.ok(fila.items.length > 0, `${fila.number} sin artículos`)
    assert.equal(fila.totalPyg, fila.subtotalPyg - fila.discountPyg, `${fila.number}: total`)
    assert.ok(fila.customerName)
  }
  assert.ok(plantillasDemo('SERVICE').length >= 3, 'plantillas del taller disponibles')
  assert.ok(plantillasDemo('SERVICE').every((plantilla) => plantilla.category === 'SERVICE'))
  assert.ok(plantillasDemo('ORDERS').some((plantilla) => plantilla.isDefault))
})

test('#324 · precios demo: listas coherentes y escalones que bajan el precio', () => {
  const listas = listDemoPriceLists()
  assert.ok(listas.length >= 3)
  const productos = [
    ...IPHONES_DEMO.map((producto) => ({ ...producto, categoria: 'Celulares', category: 'Celulares' })),
    { id: 'demo-funda-magsafe-transparente', nombre: 'Funda MagSafe Transparente', precioVenta: 180000, categoria: 'Accesorios' },
    { id: 'demo-cargador-usbc-20w', nombre: 'Cargador USB-C 20W', precioVenta: 220000, categoria: 'Accesorios' },
    { id: 'demo-airpods-pro-2-usbc', nombre: 'AirPods Pro 2 USB-C', precioVenta: 1850000, categoria: 'Audio' },
    { id: 'demo-vidrio-17-pro', nombre: 'Protector de vidrio 17 Pro', precioVenta: 120000, categoria: 'Protectores' },
  ]
  const ids = new Set(productos.map((producto) => producto.id))
  for (const lista of listas) {
    for (const item of lista.items) {
      if (item.scope === 'PRODUCT') assert.ok(ids.has(item.productId), `${lista.name}: producto ${item.productId}`)
      if (item.scope === 'CATEGORY') assert.ok(item.category)
    }
  }
  const unitario = pricingDemo({ productId: 'demo-iphone-15-pro-max-256-titanio', quantity: '1' }, productos)
  const porMayor = pricingDemo({ productId: 'demo-iphone-15-pro-max-256-titanio', quantity: '3' }, productos)
  assert.equal(porMayor.origin, 'TIER')
  assert.ok(porMayor.unitPricePyg < unitario.unitPricePyg, 'el escalón mejora el precio')
  assert.ok(porMayor.priceList?.name)
})

test('#324 · reportes demo: totales, grupos y comisiones salen de las mismas ventas', () => {
  const ventas = [
    { id: 'v1', orderNumber: 'AUR-9001', fecha: '2026-09-01', creadoEn: '2026-09-01T10:00:00.000Z', clienteId: 'c1', cliente: 'Cliente Uno', vendedorId: 'demo-user', seller: { id: 'demo-user', name: 'Hernán Acosta' }, precio: 1000000, subtotalPyg: 1000000, totalPyg: 1000000, montoDelivery: 0, precioCosto: 700000, comision: 10000, totalPagado: 1000000, totalPendiente: 0, descuento: 0, pagos: [{ medioPago: 'DINERO', monto: 1000000, amountPyg: 1000000 }], items: [{ productoId: 'p1', description: 'Producto 1', quantity: 1, totalPyg: 1000000, category: 'Celulares' }], branch: { id: 'b1', name: 'Casa Central' } },
    { id: 'v2', orderNumber: 'AUR-9002', fecha: '2026-09-02', creadoEn: '2026-09-02T10:00:00.000Z', clienteId: 'c2', cliente: 'Cliente Dos', vendedorId: 'demo-user-vendedor', seller: { id: 'demo-user-vendedor', name: 'Diego López' }, precio: 500000, subtotalPyg: 500000, totalPyg: 530000, montoDelivery: 30000, precioCosto: 300000, comision: 5000, totalPagado: 530000, totalPendiente: 0, descuento: 0, pagos: [{ medioPago: 'PIX', monto: 530000, amountPyg: 530000 }], items: [{ productoId: 'p2', description: 'Producto 2', quantity: 1, totalPyg: 500000, category: 'Accesorios' }], branch: { id: 'b1', name: 'Casa Central' } },
  ]
  const productos = [{ id: 'p1', nombre: 'Producto 1', precioVenta: 1000000, precioCosto: 700000, stock: 3, reorderPoint: 1, categoria: 'Celulares' }, { id: 'p2', nombre: 'Producto 2', precioVenta: 500000, precioCosto: 300000, stock: 10, reorderPoint: 2, categoria: 'Accesorios' }]
  const rango = { desde: '2026-09-01', hasta: '2026-09-30' }
  const reporte = reporteDemoMetricas({ rango, groupBy: 'product', ventas, productos })
  assert.equal(reporte.totals.orders, 2)
  assert.equal(reporte.totals.totalPyg, 1530000)
  assert.equal(reporte.totals.costPyg, 1000000)
  assert.equal(reporte.groups.reduce((suma, grupo) => suma + grupo.totalPyg, 0), reporte.totals.grossPyg)
  assert.equal(reporte.inventory.onHandUnits, 13)
  const comisiones = reporteDemoMetricas({ rango, groupBy: 'seller', type: 'commissions', ventas, productos })
  assert.equal(comisiones.sellers.reduce((suma, fila) => suma + fila.totalPyg, 0), reporte.totals.totalPyg)
  assert.equal(comisiones.totals.commissionPyg, 15000)
  const porDia = reporteDemoMetricas({ rango, groupBy: 'day', ventas, productos })
  assert.equal(porDia.groups.length, 2)
})

test('#324 · abastecimiento demo: necesidades, compras, lotes y alertas se correlacionan', () => {
  const needs = listDemoSupplyNeeds()
  assert.ok(needs.grupos.length >= 5)
  assert.equal(needs.contadores.pendientes >= 1, true)
  assert.ok(needs.contadores.vencidas >= 1, 'hay una necesidad vencida de ejemplo')
  for (const grupo of needs.grupos) {
    assert.ok(grupo.cantidad > 0 && grupo.producto)
    assert.equal(grupo.destinos.reduce((suma, destino) => suma + destino.cantidad, 0), grupo.cantidad, `${grupo.producto}: destinos = cantidad`)
  }
  const pendientes = listDemoSupplyPurchases({ pendientes: 1 })
  assert.ok(pendientes.compras.length >= 1, 'hay una compra por preparar')
  for (const compra of pendientes.compras) {
    for (const linea of compra.lines) {
      assert.equal(linea.faltan, Number(linea.quantity) - linea.serials.length, `${compra.code}: faltan = cantidad − IMEI`)
    }
    const etiquetas = demoSupplyPurchaseLabels(compra.id)
    assert.equal(etiquetas.etiquetas.length, compra.lines.reduce((suma, linea) => suma + Number(linea.quantity), 0))
    assert.equal(etiquetas.resumen.unidades, etiquetas.etiquetas.length)
  }
  const lotes = listDemoSupplyShipments({ pendientes: 1 })
  assert.ok(lotes.envios.length >= 1)
  for (const envio of lotes.envios) assert.equal(envio.pendientes, envio.unidades - envio.conImei)
  const alertas = demoSupplyAlerts()
  assert.ok(alertas.necesidadesVencidas.length >= 1)
  assert.ok(alertas.necesidadesVencidas.every((fila) => fila.diasVencidos >= 1 && fila.producto))
  const performance = demoSupplyPerformance({})
  assert.equal(performance.proveedores.length, 3)
  assert.ok(performance.rutas.length >= 2)
  assert.ok(demoSupplySerial('AUR0101000000000').compra?.code, 'el serial del lote se encuentra en la cadena')
})

test('#324 · sistema, reparto y cronologías tienen datos y no terminan en error simulado', () => {
  const sistema = sistemaDemo()
  assert.ok(sistema.checks.checks.length >= 5)
  assert.equal(sistema.sincronizacion.trabajos.pendientes, sistema.trabajos.filter((trabajo) => trabajo.state === 'PENDIENTE').length)
  assert.ok(sistema.sincronizacion.trabajos.ultimoExitoAt)
  const historialPersona = historialDemo('/api/users/demo-user-vendedor/history').events
  assert.ok(historialPersona.length >= 3 && historialPersona.every((evento) => evento.action))
  assert.deepEqual(historialDemo('/api/proveedores-x').events, [])
  const historialCompra = historialDemo('/api/purchases/demo-purchase-1/history').events
  assert.ok(historialCompra.some((evento) => evento.type === 'purchase'))

  const repartos = listDemoDeliveryOrdersDelRepartidor()
  assert.ok(repartos.length >= 2)
  assert.ok(repartos.every((pedido) => pedido.assignedToId === REPARTIDOR_DEMO_ID))
  const rendiciones = listDemoDeliverySettlementsDelRepartidor()
  for (const rendicion of rendiciones) {
    assert.equal(rendicion.totalPyg, rendicion.payments.reduce((suma, pago) => suma + pago.amountPyg, 0))
  }
  const pendiente = repartos.find((pedido) => pedido.delivery.pendingPyg > 0)
  const actualizado = registrarCobroRepartoDemo(pendiente.id, { amountPyg: 100000, method: 'CASH' })
  assert.equal(actualizado.delivery.pendingPyg, pendiente.delivery.pendingPyg - 100000)
  assert.ok(actualizado.payments.some((pago) => pago.amountPyg === 100000 && pago.status === 'PENDING'))
})
