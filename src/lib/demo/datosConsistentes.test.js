// #461: datos y plata consistentes en la demo. Pagado/Saldo, «Cómo te pagaron» y la caja salen de los MISMOS
// pagos; los números de pedido no se repiten; la recepción valida contra el manifiesto y su resumen coincide
// con lo que entró al stock. Todo lo que se importa acá corre en node (sin storage/API).
import test from 'node:test'
import assert from 'node:assert/strict'

const memoria = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
  setItem: (clave, valor) => memoria.set(clave, String(valor)),
  removeItem: (clave) => memoria.delete(clave),
}
globalThis.localStorage = globalThis.sessionStorage
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

const { ventasDemoLegacy, pedidosDemoDeCliente, VENTAS_DEMO } = await import('./ventas.js')
const { totalesPedido } = await import('../../utils/pedido.js')
const { cobrosPorMedio } = await import('../../utils/mediosPago.js')
const { armarResumenDia } = await import('../../utils/reporteResumen.js')
const { tomarNumeroPedidoDemo, registrarNumerosUsadosDemo } = await import('../demoTenant.js')
const { construirDemoAuditoriaEfectivo } = await import('../demoAuditoria.js')
const { getDemoCashExpected } = await import('../demoCash.js')
const { sincronizarPedidoDemoConVenta, buscarClienteDemo } = await import('../demoClientes.js')
const { createDemoSupplyReception, updateDemoSupplyReception, demoSupplyReceptionDetail, listDemoSupplyShipments } = await import('./abastecimiento.js')
const { serialDemo } = await import('./iphones.js')

const legacy = ventasDemoLegacy()

test('Pagado/Saldo: el detalle, el listado y la ficha del cliente dicen lo mismo en cada pedido demo', () => {
  assert.ok(legacy.length > 15)
  let comparados = 0
  for (const venta of legacy) {
    const { pagado, pendiente, total } = totalesPedido(venta)
    // El detalle recibe la fila del listado (`payments` = los mismos pagos legacy): misma cuenta.
    assert.deepEqual(totalesPedido({ ...venta, payments: venta.pagos }), totalesPedido(venta), `${venta.orderNumber}: detalle = listado`)
    assert.equal(pagado, venta.totalPagado, `${venta.orderNumber}: pagado = pagos de la venta`)
    assert.equal(pendiente, venta.totalPendiente, `${venta.orderNumber}: saldo = total − pagado`)
    // Ficha del cliente: los pedidos canónicos de ese cliente traen lo mismo.
    const enFicha = pedidosDemoDeCliente(venta.clienteId).find((pedido) => pedido.orderNumber === venta.orderNumber)
    assert.ok(enFicha, `${venta.orderNumber}: está en la ficha`)
    assert.equal(enFicha.collectedPyg, pagado, `${venta.orderNumber}: cobrado en la ficha`)
    assert.equal(enFicha.pendingPyg, pendiente, `${venta.orderNumber}: saldo en la ficha`)
    assert.equal(enFicha.totalPyg, total)
    comparados += 1
  }
  assert.equal(comparados, legacy.length)
})

test('un pedido con pagos de 50.000 + 30.000 muestra Pagado 80.000 en el detalle (antes: 0)', () => {
  const fila = { totalPyg: 100000, pagos: [{ monto: 50000, amountPyg: 50000 }, { monto: 30000, amountPyg: 30000 }] }
  assert.deepEqual(totalesPedido(fila), { total: 100000, pagado: 80000, pendiente: 20000, estado: 'Parcial' })
})

test('cobrar un saldo en la demo actualiza la ficha del cliente con la misma cuenta', () => {
  const parcial = legacy.find((venta) => venta.totalPendiente > 0 && venta.clienteId)
  assert.ok(parcial, 'hay un pedido con saldo')
  const cliente = buscarClienteDemo(parcial.clienteId)
  const pedido = cliente.demoProfile.orders.find((fila) => fila.orderNumber === parcial.orderNumber)
  assert.equal(pedido.pendingPyg, parcial.totalPendiente)
  const cobrada = { ...parcial, pagos: [...parcial.pagos, { id: 'p-saldo', medioPago: 'DINERO', monto: parcial.totalPendiente, amountPyg: parcial.totalPendiente }] }
  assert.equal(sincronizarPedidoDemoConVenta(cobrada), true)
  assert.equal(pedido.pendingPyg, 0, 'la ficha ya no debe saldo')
  assert.equal(pedido.collectedPyg, parcial.totalPyg)
  assert.equal(pedido.status, 'COMPLETED')
})

test('«Cómo te pagaron» (Inicio) suma los mismos pagos que Caja, medio por medio', () => {
  const rango = { desde: '0000-00-00', hasta: '9999-99-99' }
  const resumen = armarResumenDia({ ventas: legacy, rango, prev: rango })
  const porCaja = cobrosPorMedio(legacy.flatMap((venta) => venta.pagos))
  assert.ok(resumen.medios.length > 1, 'hay más de un medio (ya no «100% efectivo»)')
  for (const fila of porCaja.filter((item) => item.montoPyg > 0)) {
    const enInicio = resumen.medios.find((medio) => medio.method === fila.method)
    assert.ok(enInicio, `${fila.label} aparece en Inicio`)
    assert.equal(enInicio.monto, fila.montoPyg, `${fila.label}: mismo monto que Caja`)
  }
  const cobrado = legacy.reduce((suma, venta) => suma + venta.totalPagado, 0)
  assert.equal(resumen.medios.reduce((suma, medio) => suma + medio.monto, 0), cobrado, 'los medios suman lo cobrado')
  assert.ok(Math.abs(resumen.medios.reduce((suma, medio) => suma + medio.pct, 0) - 100) < 0.001)
})

test('los medios cuentan los pagos firmados: una corrección no duplica ni resta de más', () => {
  const pagos = [
    { id: 'a', method: 'CASH', amountPyg: 100000, status: 'CONFIRMED' },
    { id: 'r', method: 'CASH', amountPyg: -100000, status: 'CONFIRMED', reversalOfId: 'a' },
    { id: 'n', method: 'TRANSFER', amountPyg: 100000, status: 'CONFIRMED' },
  ]
  const medios = cobrosPorMedio(pagos)
  assert.deepEqual(medios.map((fila) => [fila.method, fila.montoPyg, fila.count]), [['TRANSFER', 100000, 1]])
})

test('Caja: el esperado y la auditoría usan UNA definición (apertura + efectivo ± movimientos)', () => {
  const ahora = new Date()
  const hace = (minutos) => new Date(ahora.getTime() - minutos * 60000).toISOString()
  const cash = {
    id: 'c1', status: 'OPEN', openedAt: hace(30), openingPyg: 500000,
    movements: [
      { id: 'm1', kind: 'INGRESO', concept: 'Aporte', amountPyg: 300000, createdAt: hace(20) },
      { id: 'm2', kind: 'EGRESO', concept: 'Retiro', amountPyg: 150000, createdAt: hace(15) },
    ],
  }
  const ventas = [{ id: 'v', vendedorId: 'demo-user', fecha: ahora.toLocaleDateString('sv'), pagos: [
    { id: 'p1', medioPago: 'DINERO', monto: 400000, fecha: hace(10) },
    { id: 'p2', medioPago: 'UENO BANK', monto: 90000, fecha: hace(10) },
  ] }]
  const esperadoTurno = getDemoCashExpected(cash, new Date(ahora.getTime() + 60000), ventas)
  assert.equal(esperadoTurno, 500000 + 400000 + 300000 - 150000, 'apertura + efectivo + ingresos − egresos; la transferencia no entra')
  const hoy = ahora.toLocaleDateString('sv')
  const ayer = new Date(ahora.getTime() - 86400000).toLocaleDateString('sv')
  const { resumen } = construirDemoAuditoriaEfectivo({ ventas, cash, desde: ayer, hasta: hoy })
  assert.equal(resumen.salidasPyg, 150000)
  assert.equal(resumen.esperadoPyg, resumen.aperturaPyg + resumen.recibidoPyg - resumen.salidasPyg, 'el esperado del rango = inicial + recibido − salidas')
  assert.equal(resumen.esperadoPyg, esperadoTurno, 'con un solo turno en el día, los dos esperados coinciden')
})

test('numeración demo: nunca repite un número ya usado (sembrado o guardado) y no se hace pasar por otro', () => {
  const usados = new Set(VENTAS_DEMO.map((venta) => venta.numero))
  const guardados = ['AUR-0030', 'AUR-#0031']
  registrarNumerosUsadosDemo(() => guardados)
  const tomados = Array.from({ length: 25 }, () => tomarNumeroPedidoDemo())
  assert.equal(new Set(tomados).size, tomados.length, 'ninguno se repite')
  for (const numero of tomados) {
    assert.ok(!usados.has(numero), `${numero} ya existía en las ventas sembradas`)
    assert.match(numero, /^AUR-\d{4}$/)
    assert.ok(!guardados.includes(numero))
  }
  const secuencias = tomados.map((numero) => Number(numero.slice(4)))
  assert.ok(Math.min(...secuencias) > 31, 'salta por encima de lo ya usado')
  assert.deepEqual(secuencias, [...secuencias].sort((a, b) => a - b), 'crece en orden')
})

test('recepción demo: rechaza códigos mal formados y los que no están en el manifiesto', () => {
  const envio = listDemoSupplyShipments().envios?.find?.((fila) => fila.code === 'LOTE-AUR-0001')
  assert.ok(envio, 'el lote de prueba existe')
  const abierta = createDemoSupplyReception({ shipmentId: envio.id }).recepcion
  assert.throws(() => updateDemoSupplyReception({ id: abierta.id, action: 'scan', serial: '999' }), /Formato inválido/)
  assert.throws(() => updateDemoSupplyReception({ id: abierta.id, action: 'scan', serial: 'ZZZ-NO-EXISTE' }), /no está en el manifiesto/)
  // Un IMEI del manifiesto entra; repetirlo se rechaza.
  const detalle = updateDemoSupplyReception({ id: abierta.id, action: 'scan', serial: serialDemo(110) })
  assert.equal(detalle.resumen.RECIBIDO, 1)
  assert.throws(() => updateDemoSupplyReception({ id: abierta.id, action: 'scan', serial: serialDemo(110) }), /ya se escaneó/)
  // Una unidad de más solo se registra pidiéndola como sobrante: queda aparte y no entra al stock.
  const conSobrante = updateDemoSupplyReception({ id: abierta.id, action: 'scan', serial: 'ZZZ-NO-EXISTE', resultado: 'SOBRANTE' })
  assert.equal(conSobrante.resumen.SOBRANTE, 1)
  assert.equal(conSobrante.resumen.RECIBIDO, 1)
})

test('recepción demo: el resumen y «entraron al stock» cuentan lo mismo (sin 0 unidades con N recibidas)', () => {
  const envio = listDemoSupplyShipments().envios?.find?.((fila) => fila.code === 'LOTE-AUR-0001')
  const abierta = demoSupplyReceptionDetail({ shipmentId: envio.id }).recepcion
  const confirmada = updateDemoSupplyReception({ id: abierta.id, action: 'confirm', locationId: 'demo-ubic-deposito-1' })
  // Lo esperado que no se escaneó queda faltante; lo recibido contra el manifiesto es lo que entró al stock.
  assert.equal(confirmada.resumen.RECIBIDO, confirmada.unidadesCreadas, 'recibidas del resumen = unidades que entraron')
  assert.equal(confirmada.resumen.FALTANTE, 1, 'la unidad sin escanear queda faltante')
  assert.equal(confirmada.resumen.SOBRANTE, 1)
  assert.equal(confirmada.estadoLote, 'CON_INCIDENCIA')
})
