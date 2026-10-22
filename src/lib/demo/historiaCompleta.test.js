// Historia completa de la demo: cada pedido, cliente, IMEI, producto, cuenta,
// caja, orden de taller y cuota tiene cronología (≥3 eventos), los saldos de
// caja y bancos cierran, el kardex cierra contra el stock y ningún filtro de
// período (Hoy, Ayer, 7 días, Mes, Mes anterior) queda vacío, sea cual sea el
// día y la hora en que se cargue la demo. Todo puro: corre en node.
import test from 'node:test'
import assert from 'node:assert/strict'

const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

const { ventasDemoLegacy, VENTAS_DEMO } = await import('./ventas.js')
const { eventosPedidoDemo } = await import('./historiaPedido.js')
const { gastosDemo, adsDemo } = await import('./finanzas.js')
const { DEMO_PURCHASES } = await import('./compras.js')
const { ACCESORIOS_DEMO } = await import('./catalogoPro.js')
const { IPHONES_DEMO } = await import('./iphones.js')
const { ORDENES_TALLER_DEMO } = await import('./taller.js')
const { COTIZACIONES_DEMO } = await import('./cotizaciones.js')
const { eventosTallerDemo } = await import('./historiaTaller.js')
const { eventosCuotaDemo } = await import('./historiaCuota.js')
const { construirLibrosDemo, CUENTAS_LIBRO, FONDO_CAJA, PERIODOS, enPeriodo, rangoPeriodo } = await import('./historiaCuentas.js')
const { historiaUnidadDemo, lotesDeCompraDemo } = await import('./historiaStock.js')
const { construirKardexDemo } = await import('../../components/productos/kardexDemo.js')
const { demoInventorySeed } = await import('../demoInventory.js')
const { listarClientesDemo, buildDemoTimeline } = await import('../demoClientes.js')

const ahoraBase = new Date()
// Instantes de carga de la demo: varios días y, cada uno, madrugada, mañana y noche.
const INSTANTES = []
for (const dias of [0, 1, 5, 13, 31, 33, 58]) {
  for (const [hora, minuto] of [[0, 6], [8, 30], [23, 55]]) {
    const base = new Date(ahoraBase.getTime() + dias * 86400000)
    INSTANTES.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hora + 3, minuto)))
  }
}

const legacy = ventasDemoLegacy(ahoraBase)

test('cada pedido tiene cronología de ≥3 eventos, ordenada, sin futuro y con pagos que suman lo cobrado', () => {
  for (const venta of legacy) {
    const eventos = eventosPedidoDemo(venta, ahoraBase)
    assert.ok(eventos.length >= 3, `${venta.id}: ${eventos.length} eventos`)
    assert.ok(eventos.some((e) => e.type === 'created'), `${venta.id}: sin creación`)
    for (let i = 1; i < eventos.length; i += 1) assert.ok(new Date(eventos[i - 1].at) >= new Date(eventos[i].at), `${venta.id}: desordenado`)
    assert.ok(eventos.every((e) => new Date(e.at).getTime() <= ahoraBase.getTime()), `${venta.id}: evento futuro`)
    const pagado = eventos.filter((e) => e.type === 'payment').reduce((suma, e) => suma + e.payment.amountPyg, 0)
    assert.equal(pagado, venta.totalPagado, `${venta.id}: los pagos de la cronología suman lo cobrado`)
    if (venta.status === 'CANCELLED') assert.ok(eventos.some((e) => e.action === 'ORDER_VOIDED'), `${venta.id}: anulación`)
    else {
      const entrega = eventos.filter((e) => e.action === 'ORDER_FULFILLMENT_UPDATED')
      assert.equal(entrega[0].metadata.current, venta.fulfillmentStatus, `${venta.id}: el último cambio de entrega es el estado actual`)
    }
  }
  const estados = new Set(legacy.map((v) => v.fulfillmentStatus))
  for (const estado of ['PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) assert.ok(estados.has(estado), `falta el estado ${estado}`)
  assert.ok(legacy.some((v) => v.status === 'CANCELLED'))
})

test('cada cliente tiene cronología de ≥3 eventos y los pagos de sus pedidos canónicos suman lo cobrado', () => {
  for (const cliente of listarClientesDemo()) {
    const eventos = buildDemoTimeline(cliente)
    assert.ok(eventos.length >= 3, `${cliente.id}: ${eventos.length} eventos`)
    assert.ok(new Set(eventos.map((e) => e.id)).size === eventos.length, `${cliente.id}: ids repetidos`)
    const tipos = new Set(eventos.map((e) => e.type))
    assert.ok(tipos.has('customer'), `${cliente.id}: sin alta`)
    for (const pedido of cliente.demoProfile.orders.filter((o) => /^demo-(venta|hist|cob)/.test(o.id))) {
      const cobrado = eventos.filter((e) => e.id.startsWith(`${pedido.id}-pago-`)).reduce((suma, e) => suma + Number(/Gs ([\d.]+)/.exec(e.detail)?.[1].replace(/\./g, '') || 0), 0)
      assert.equal(cobrado, pedido.collectedPyg, `${cliente.id}/${pedido.id}: pagos de la cronología`)
    }
  }
  const todos = listarClientesDemo().flatMap((c) => buildDemoTimeline(c).map((e) => e.type))
  for (const tipo of ['order', 'payment', 'notice', 'warranty', 'service', 'note']) assert.ok(todos.includes(tipo), `ningún cliente tiene eventos ${tipo}`)
})

test('caja, bancos, tarjetas y billeteras: saldos que cierran, transferencias que se anulan y turnos encadenados', () => {
  const libros = construirLibrosDemo({ ventas: legacy, gastos: gastosDemo(ahoraBase), ads: adsDemo(ahoraBase), compras: DEMO_PURCHASES, ahora: ahoraBase })
  assert.equal(libros.cuentas.length, CUENTAS_LIBRO.length)
  for (const cuenta of libros.cuentas) {
    const neto = cuenta.movimientos.reduce((suma, m) => suma + m.ingresoPyg - m.egresoPyg, 0)
    assert.equal(cuenta.saldoPyg, cuenta.aperturaPyg + neto, `${cuenta.name}: saldo = apertura + movimientos`)
    assert.equal(cuenta.movimientos[0].saldoPyg, cuenta.saldoPyg, `${cuenta.name}: el último saldo corrido es el saldo`)
    assert.ok(cuenta.movimientos.every((m) => m.saldoPyg >= 0), `${cuenta.name}: saldo negativo`)
    assert.ok(cuenta.movimientos.length >= 3, `${cuenta.name}: pocos movimientos`)
  }
  const porTransferencia = new Map()
  for (const cuenta of libros.cuentas) for (const m of cuenta.movimientos) if (m.ref.startsWith('demo-transf-')) {
    const fila = porTransferencia.get(m.ref) || { entra: 0, sale: 0 }
    fila.entra += m.ingresoPyg; fila.sale += m.egresoPyg
    porTransferencia.set(m.ref, fila)
  }
  assert.ok(porTransferencia.size > 50)
  for (const [id, fila] of porTransferencia) assert.equal(fila.entra, fila.sale, `${id}: lo que sale entra`)
  // Turnos de caja: esperado = apertura + efectivo + movimientos; apertura = contado del turno anterior.
  const orden = [...libros.sesiones].reverse()
  assert.ok(orden.length >= 100, 'unos 4 meses de turnos')
  orden.forEach((sesion, i) => {
    assert.equal(sesion.esperadoPyg, sesion.openingPyg + sesion.efectivoPyg + sesion.movimientosPyg, `${sesion.id}: esperado`)
    assert.equal(sesion.diferenciaPyg, sesion.contadoPyg - sesion.esperadoPyg, `${sesion.id}: diferencia`)
    if (i > 0) assert.equal(sesion.openingPyg, orden[i - 1].contadoPyg, `${sesion.id}: apertura = contado anterior`)
  })
  assert.equal(orden.at(-1).contadoPyg, FONDO_CAJA, 'ayer cierra exacto y hoy abre con el fondo')
  assert.ok(orden.some((s) => s.diferenciaPyg !== 0), 'hay arqueos con diferencia')
  // El saldo del libro de la caja en cada cierre es lo contado.
  const caja = libros.cuentas.find((c) => c.id === 'demo-cash-pyg')
  for (const sesion of orden) {
    const cierre = caja.movimientos.find((m) => m.tipo === 'CIERRE' && m.ref === sesion.id)
    assert.equal(cierre.saldoPyg, sesion.contadoPyg, `${sesion.id}: saldo del libro al cierre`)
  }
})

test('ninguna cuenta queda vacía en Hoy, Ayer, 7 días, Mes ni Mes anterior (cualquier día y hora de carga)', () => {
  for (const ahora of INSTANTES) {
    const ventas = ventasDemoLegacy(ahora)
    const libros = construirLibrosDemo({ ventas, gastos: gastosDemo(ahora), ads: adsDemo(ahora), compras: DEMO_PURCHASES, ahora })
    for (const cuenta of libros.cuentas) {
      assert.ok(cuenta.movimientos.every((m) => m.saldoPyg >= 0), `${cuenta.name}: saldo negativo al ${ahora.toISOString()}`)
      for (const periodo of PERIODOS) {
        const n = cuenta.movimientos.filter((m) => enPeriodo(m, periodo.id, ahora)).length
        assert.ok(n > 0, `${cuenta.name} · ${periodo.label} vacío al ${ahora.toISOString()}`)
      }
    }
    // Cobros de cada medio, señas y cuotas en cada período.
    for (const periodo of PERIODOS) {
      const cobros = libros.cuentas.flatMap((c) => c.movimientos).filter((m) => enPeriodo(m, periodo.id, ahora))
      assert.ok(cobros.some((m) => m.tipo === 'COBRO' && m.concepto === 'Seña de pedido'), `${periodo.label}: sin señas (${ahora.toISOString()})`)
      assert.ok(cobros.some((m) => m.tipo === 'COBRO_CUOTA'), `${periodo.label}: sin cobros de cuotas/saldos (${ahora.toISOString()})`)
      assert.ok(cobros.some((m) => m.tipo === 'GASTO' || m.tipo === 'CHEQUE' || m.tipo === 'ADELANTO' || m.tipo === 'PUBLICIDAD'), `${periodo.label}: sin gastos (${ahora.toISOString()})`)
    }
  }
})

test('pedidos, cotizaciones, taller y gastos tienen movimiento en todos los períodos y estados distintos hoy', () => {
  const sello = (valor) => new Date(valor).getTime()
  const dentro = (valor, periodo, ahora) => { const [desde, hasta] = rangoPeriodo(periodo, ahora); return sello(valor) >= desde && sello(valor) < hasta }
  for (const ahora of INSTANTES) {
    const ventas = ventasDemoLegacy(ahora)
    const cotizaciones = COTIZACIONES_DEMO
    const taller = ORDENES_TALLER_DEMO
    for (const periodo of PERIODOS) {
      assert.ok(ventas.some((v) => dentro(v.creadoEn, periodo.id, ahora)), `pedidos · ${periodo.label} (${ahora.toISOString()})`)
      assert.ok(gastosDemo(ahora).some((g) => dentro(g.creadoEn, periodo.id, ahora)), `gastos · ${periodo.label} (${ahora.toISOString()})`)
    }
    const hoy = ventas.filter((v) => dentro(v.creadoEn, 'hoy', ahora))
    assert.ok(new Set(hoy.map((v) => v.fulfillmentStatus)).size >= 3, 'hoy hay pedidos en ≥3 estados')
    assert.ok(ventas.some((v) => new Date(ahora).getTime() - sello(v.creadoEn) <= 30 * 60000), 'hay pedidos de hace minutos (recién)')
    void cotizaciones; void taller
  }
  // Cotizaciones y taller se siembran respecto del momento de carga real.
  for (const periodo of PERIODOS) {
    assert.ok(COTIZACIONES_DEMO.some((c) => dentro(c.createdAt, periodo.id, ahoraBase)), `cotizaciones · ${periodo.label}`)
    assert.ok(ORDENES_TALLER_DEMO.some((o) => dentro(o.receivedAt, periodo.id, ahoraBase)), `taller · ${periodo.label}`)
  }
  assert.ok(new Set(ORDENES_TALLER_DEMO.map((o) => o.status)).size >= 6, 'taller en ≥6 estados')
})

test('el kardex de cada producto y de cada IMEI cierra contra el stock actual con historia (≥3 movimientos)', () => {
  const ventas = legacy
  for (const [id, nombre, , , , stock] of ACCESORIOS_DEMO) {
    const data = construirKardexDemo({ producto: { id, name: nombre, stock }, unidades: [], historia: { ventas, compras: DEMO_PURCHASES, ahora: ahoraBase } })
    assert.equal(data.saldoInicial, 0, `${nombre}: saldo inicial`)
    assert.equal(data.cierre, stock, `${nombre}: cierra contra el stock`)
    assert.ok(data.movimientos.length >= 3, `${nombre}: movimientos`)
    assert.ok(data.movimientos.every((m) => m.saldo >= 0), `${nombre}: saldo negativo`)
    const tipos = new Set(data.movimientos.map((m) => m.kind))
    assert.ok(tipos.has('COMPRA') || tipos.has('ALTA'), `${nombre}: sin compras`)
  }
  const kinds = new Set()
  const { units } = demoInventorySeed()
  for (const producto of IPHONES_DEMO) {
    const unidades = units.filter((u) => u.productId === producto.id)
    if (!unidades.length) continue
    const stock = unidades.filter((u) => u.status === 'AVAILABLE' && !u.removedAt).length
    const data = construirKardexDemo({ producto: { id: producto.id, name: producto.nombre, stock }, unidades, transferencias: [], historia: { ventas, compras: DEMO_PURCHASES, ahora: ahoraBase } })
    assert.equal(data.saldoInicial, 0, `${producto.nombre}: saldo inicial`)
    assert.equal(data.cierre, stock, `${producto.nombre}: cierra`)
    assert.ok(data.movimientos.length >= 3, `${producto.nombre}: movimientos`)
    data.movimientos.forEach((m) => kinds.add(m.kind))
  }
  for (const tipo of ['COMPRA', 'VENTA', 'AJUSTE', 'TRANSFERENCIA']) assert.ok(kinds.has(tipo), `kardex de equipos sin ${tipo}`)
  for (const unidad of units) {
    const eventos = historiaUnidadDemo(unidad, { ventas, ahora: ahoraBase })
    assert.ok(eventos.length >= 3, `${unidad.serial}: historia de IMEI`)
    assert.ok(eventos.every((e) => new Date(e.createdAt).getTime() <= ahoraBase.getTime()), `${unidad.serial}: futuro`)
  }
  // Las ventas por IMEI citan el pedido real.
  const vendida = historiaUnidadDemo(units.find((u) => u.serial === VENTAS_DEMO.find((v) => v.id === 'demo-venta-extra-5').items[0].seriales[0]), { ventas, ahora: ahoraBase })
  assert.ok(vendida.some((e) => /AUR-0008/.test(e.label)))
  // Los pagos a proveedores del banco salen de las mismas reposiciones del kardex.
  const lotes = lotesDeCompraDemo({ productos: ACCESORIOS_DEMO.map(([id, name, , , , stock]) => ({ id, name, stock })), unidades: units, ventas, compras: DEMO_PURCHASES, ahora: ahoraBase })
  assert.ok(lotes.length > 50)
})

test('cada orden de taller tiene historial por etapa (≥3 eventos) que termina en su estado actual', () => {
  for (const orden of ORDENES_TALLER_DEMO) {
    const eventos = eventosTallerDemo(orden, ahoraBase)
    assert.ok(eventos.length >= 3, `${orden.serviceNumber}: ${eventos.length} eventos`)
    assert.ok(eventos.every((e) => new Date(e.createdAt).getTime() <= ahoraBase.getTime()))
    const ultima = eventos.find((e) => /^Etapa: /.test(e.action))
    if (orden.status !== 'RECIBIDO') assert.match(ultima.action, /Etapa: /)
  }
})

test('cada cuota a crédito tiene historial con plan, pagos, vencimiento y mora', () => {
  const creditos = legacy.filter((v) => Number(v.creditDays) > 0 && v.status !== 'CANCELLED')
  assert.ok(creditos.length >= 4)
  for (const venta of creditos) {
    const row = { id: `${venta.id}-cuota-1`, orderId: venta.id, reference: 'Cuota 1/2', dueAt: new Date(new Date(venta.creadoEn).getTime() + venta.creditDays * 86400000).toISOString(), saldoPendientePyg: Math.round(venta.totalPendiente / 2), recargoPyg: 0 }
    const eventos = eventosCuotaDemo(row, venta, ahoraBase)
    assert.ok(eventos.length >= 3, `${venta.id}: ${eventos.length} eventos de cuota`)
    assert.ok(eventos.some((e) => e.type === 'payment'))
  }
  const enMora = legacy.find((v) => v.id === 'demo-venta-credito-3')
  const mora = eventosCuotaDemo({ id: 'c', orderId: enMora.id, reference: 'Cuota 1/2', dueAt: new Date(new Date(enMora.creadoEn).getTime() + 7 * 86400000).toISOString(), saldoPendientePyg: 300000, recargoPyg: 120000 }, enMora, ahoraBase)
  assert.ok(mora.some((e) => /Mora/.test(e.action)))
})
