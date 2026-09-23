import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_OFFSET_MINUTES,
  MAX_REPORT_ORDERS,
  ReportInputError,
  aggregateCommissions,
  aggregateReport,
  curvaAbc,
  dayBounds,
  diasDelRango,
  esFechaValida,
  localDayKey,
  parseReportQuery,
} from '../lib/reporting'

const orden = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'COMPLETED',
  subtotalPyg: 100000,
  discountPyg: 0,
  deliveryPyg: 0,
  totalPyg: 100000,
  sellerId: 'v1',
  sellerName: 'Vendedor Uno',
  createdAt: '2026-09-10T15:00:00.000Z',
  items: [{ productId: 'p1', description: 'Case', productName: 'Case iPhone 15', category: 'Accesorios', quantity: 1, unitCostPyg: 60000, totalPyg: 100000 }],
  payments: [{ status: 'CONFIRMED', amountPyg: 100000 }],
  ...overrides,
})

test('convierte el rango local al límite UTC correcto', () => {
  const { start, end } = dayBounds('2026-09-01', '2026-09-01', DEFAULT_OFFSET_MINUTES)
  // Paraguay es UTC-3: el día local empieza a las 03:00 UTC y termina 24 h después.
  assert.equal(start.toISOString(), '2026-09-01T03:00:00.000Z')
  assert.equal(end.toISOString(), '2026-09-02T03:00:00.000Z')
  assert.equal(diasDelRango('2026-09-01', '2026-09-30'), 30)
})

test('el día de negocio se calcula con el desfase de la empresa', () => {
  // 02:00 UTC del 11-09 todavía es 23:00 del 10-09 en Paraguay.
  assert.equal(localDayKey('2026-09-11T02:00:00.000Z', -180), '2026-09-10')
  assert.equal(localDayKey('2026-09-11T04:00:00.000Z', -180), '2026-09-11')
  assert.equal(localDayKey('2026-09-11T02:00:00.000Z', 0), '2026-09-11')
})

test('valida fechas reales del calendario', () => {
  assert.ok(esFechaValida('2026-02-28'))
  assert.equal(esFechaValida('2026-02-30'), false)
  assert.equal(esFechaValida('2026-13-01'), false)
  assert.equal(esFechaValida('11-09-2026'), false)
  assert.equal(esFechaValida(''), false)
  assert.equal(esFechaValida(null), false)
})

test('por defecto analiza los últimos 30 días', () => {
  const parsed = parseReportQuery(new URLSearchParams(), new Date('2026-09-11T12:00:00.000Z'))
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.equal(parsed.value.to, '2026-09-11')
  assert.equal(parsed.value.from, '2026-08-13')
  assert.equal(diasDelRango(parsed.value.from, parsed.value.to), 30)
  assert.equal(parsed.value.groupBy, 'product')
  assert.equal(parsed.value.offsetMinutes, DEFAULT_OFFSET_MINUTES)
})

test('rechaza rangos, agrupaciones y desfases inválidos', () => {
  const caso = (query: string) => parseReportQuery(new URLSearchParams(query), new Date('2026-09-11T12:00:00.000Z'))
  assert.equal(caso('from=2026-09-30&to=2026-09-01').ok, false)
  assert.equal(caso('from=2026-09-01&to=2026-02-30').ok, false)
  assert.equal(caso('from=2020-01-01&to=2026-09-11').ok, false)
  assert.equal(caso('groupBy=inventado').ok, false)
  assert.equal(caso('tzOffset=9999').ok, false)
  assert.equal(caso('tzOffset=abc').ok, false)
  assert.ok(caso('groupBy=day&tzOffset=-240').ok)
})

test('suma la orden una sola vez aunque tenga varios pagos', () => {
  const reporte = aggregateReport([
    orden({ payments: [{ status: 'CONFIRMED', amountPyg: 40000 }, { status: 'CONFIRMED', amountPyg: 60000 }] }),
  ], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.totals.orders, 1)
  assert.equal(reporte.totals.totalPyg, 100000)
  assert.equal(reporte.totals.collectedPyg, 100000)
  assert.equal(reporte.totals.pendingPyg, 0)
  assert.equal(reporte.totals.costPyg, 60000)
  assert.equal(reporte.totals.profitPyg, 40000)
  assert.equal(reporte.totals.marginPct, 40)
})

test('los pagos no confirmados no cuentan como cobro', () => {
  const reporte = aggregateReport([
    orden({ payments: [{ status: 'PENDING', amountPyg: 40000 }, { status: 'CONFIRMED', amountPyg: 30000 }] }),
  ], { groupBy: 'day', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.totals.collectedPyg, 30000)
  assert.equal(reporte.totals.pendingPyg, 70000)
})

test('descarta comisiones de pago del margen real sin estimar las históricas', () => {
  const reporte = aggregateReport([
    orden({ payments: [{ status: 'CONFIRMED', amountPyg: 100000, feePyg: 3500 }] }),
  ], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.totals.commissionPyg, 3500)
  assert.equal(reporte.totals.profitPyg, 40000)
  assert.equal(reporte.totals.netProfitPyg, 36500)
  assert.equal(reporte.totals.netMarginPct, 36.5)
})

test('sin estado de pago se asume confirmado, como en la base', () => {
  const reporte = aggregateReport([orden({ payments: [{ amountPyg: 100000 }] })], {
    groupBy: 'day',
    offsetMinutes: DEFAULT_OFFSET_MINUTES,
  })
  assert.equal(reporte.totals.collectedPyg, 100000)
})

test('las órdenes canceladas no suman', () => {
  const reporte = aggregateReport([
    orden({ id: 'ok' }),
    orden({ id: 'cancelada', status: 'CANCELLED' }),
  ], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.totals.orders, 1)
  assert.equal(reporte.totals.totalPyg, 100000)
  assert.equal(reporte.groups.length, 1)
})

test('nunca inventa costo: la línea sin costo queda informada aparte', () => {
  const reporte = aggregateReport([
    orden({
      items: [
        { productId: 'p1', description: 'Con costo', quantity: 2, unitCostPyg: 50000, totalPyg: 160000 },
        { productId: 'p2', description: 'Sin costo', quantity: 1, unitCostPyg: null, totalPyg: 90000 },
      ],
    }),
  ], { groupBy: 'product', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.totals.costPyg, 100000)
  assert.equal(reporte.totals.profitPyg, 60000)
  assert.equal(reporte.totals.salesWithoutCostPyg, 90000)
  assert.equal(reporte.totals.linesWithoutCost, 1)
  // El margen usa solo la venta con costo conocido: 60.000 / 160.000.
  assert.equal(reporte.totals.marginPct, 37.5)
  const sinCosto = reporte.groups.find((g) => g.label === 'Sin costo')
  assert.equal(sinCosto?.linesWithoutCost, 1)
  assert.equal(sinCosto?.profitPyg, 0)
})

test('agrupa por producto y por categoría a nivel de línea', () => {
  const base = orden({
    discountPyg: 10000,
    totalPyg: 190000,
    items: [
      { productId: 'p1', description: 'Case', productName: 'Case iPhone 15', category: 'Accesorios', quantity: 2, unitCostPyg: 30000, totalPyg: 120000 },
      { productId: 'p2', description: 'Lámina', category: 'Accesorios', quantity: 1, unitCostPyg: 10000, totalPyg: 70000 },
    ],
  })
  const porProducto = aggregateReport([base], { groupBy: 'product', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.deepEqual(porProducto.groups.map((g) => g.label).sort(), ['Case iPhone 15', 'Lámina'])
  const case15 = porProducto.groups.find((g) => g.key === 'p1')
  assert.equal(case15?.units, 2)
  assert.equal(case15?.grossPyg, 120000)
  assert.equal(case15?.costPyg, 60000)
  assert.equal(case15?.profitPyg, 60000)
  // El descuento global pertenece a la orden: no se reparte entre productos.
  assert.equal(case15?.discountPyg, 0)
  assert.equal(porProducto.totals.discountPyg, 10000)

  const porCategoria = aggregateReport([base], { groupBy: 'category', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(porCategoria.groups.length, 1)
  assert.equal(porCategoria.groups[0].label, 'Accesorios')
  assert.equal(porCategoria.groups[0].grossPyg, 190000)
  assert.equal(porCategoria.groups[0].units, 3)
  assert.equal(porCategoria.groups[0].orders, 1)
})

test('la categoría sin producto cargado se informa como sin categoría', () => {
  const reporte = aggregateReport([
    orden({ items: [{ productId: null, description: 'Suelto', category: null, quantity: 1, unitCostPyg: 1000, totalPyg: 5000 }] }),
  ], { groupBy: 'category', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(reporte.groups[0].label, 'Sin categoría')
  assert.equal(reporte.groups[0].grossPyg, 5000)
})

test('agrupa por día con el calendario de la empresa y ordena cronológicamente', () => {
  const reporte = aggregateReport([
    orden({ id: 'a', createdAt: '2026-09-11T02:00:00.000Z' }),
    orden({ id: 'b', createdAt: '2026-09-11T04:00:00.000Z' }),
  ], { groupBy: 'day', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.deepEqual(reporte.groups.map((g) => g.key), ['2026-09-10', '2026-09-11'])
  assert.equal(reporte.groups[0].totalPyg, 100000)
  assert.equal(reporte.groups[1].totalPyg, 100000)
})

test('agrupa por vendedor y suma varias órdenes del mismo vendedor', () => {
  const reporte = aggregateReport([
    orden({ id: 'a' }),
    orden({ id: 'b' }),
    orden({ id: 'c', sellerId: 'v2', sellerName: 'Vendedor Dos', totalPyg: 50000, subtotalPyg: 50000, items: [{ description: 'Otro', quantity: 1, unitCostPyg: 20000, totalPyg: 50000 }] }),
  ], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })

  assert.equal(reporte.groups[0].label, 'Vendedor Uno')
  assert.equal(reporte.groups[0].orders, 2)
  assert.equal(reporte.groups[0].totalPyg, 200000)
  assert.equal(reporte.groups[0].profitPyg, 80000)
  assert.equal(reporte.groups[1].label, 'Vendedor Dos')
  assert.equal(reporte.groups[1].profitPyg, 30000)
})

test('un período sin ventas devuelve totales en cero y sin grupos', () => {
  const reporte = aggregateReport([], { groupBy: 'product', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(reporte.totals.orders, 0)
  assert.equal(reporte.totals.totalPyg, 0)
  assert.equal(reporte.totals.marginPct, null)
  assert.deepEqual(reporte.groups, [])
})

// El descuento del carrito es a nivel orden: sin descontarlo, la ganancia por
// vendedor/día quedaba por encima de `Total − Costo` y la comisión del vendedor
// se calculaba (y se liquidaba) sobre un margen inflado.
test('el descuento del carrito baja la ganancia y la comisión del vendedor', () => {
  const conDescuento = orden({ discountPyg: 10000, subtotalPyg: 100000, totalPyg: 90000 })
  const porVendedor = aggregateReport([conDescuento], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(porVendedor.totals.totalPyg, 90000)
  assert.equal(porVendedor.totals.costPyg, 60000)
  // Ganancia real: 90.000 − 60.000 = 30.000 (antes daba 40.000).
  assert.equal(porVendedor.totals.profitPyg, 30000)
  assert.equal(porVendedor.totals.salesWithCostPyg, 90000)
  assert.equal(porVendedor.totals.marginPct, 33.3)
  assert.equal(porVendedor.groups[0].profitPyg, 30000)
  assert.equal(porVendedor.groups[0].netProfitPyg, 30000)

  // Por producto el descuento del carrito sigue perteneciendo a la orden: la
  // fila muestra el margen de la línea y el total del período ya es neto.
  const porProducto = aggregateReport([conDescuento], { groupBy: 'product', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(porProducto.groups[0].profitPyg, 40000)
  assert.equal(porProducto.totals.profitPyg, 30000)

  // Comisión 10%: sobre 30.000 de margen real, no sobre 40.000.
  const comisiones = aggregateCommissions([conDescuento], [{ userId: 'v1', percentPyg: 10 }])
  assert.equal(comisiones.sellers[0].marginPyg, 30000)
  assert.equal(comisiones.sellers[0].commissionPyg, 3000)
  assert.equal(comisiones.totals.commissionPyg, 3000)
})

test('el descuento no inventa ganancia: por encima del margen queda en cero', () => {
  const venta = orden({ discountPyg: 95000, subtotalPyg: 100000, totalPyg: 5000 })
  const reporte = aggregateReport([venta], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(reporte.totals.profitPyg, 0)
  assert.equal(reporte.totals.marginPct, 0)
  const comisiones = aggregateCommissions([venta], [{ userId: 'v1', percentPyg: 10 }])
  assert.equal(comisiones.sellers[0].marginPyg, 0)
  assert.equal(comisiones.sellers[0].commissionPyg, 0)
})

// Una sola fórmula de margen por venta: el reporte y las comisiones no pueden
// pisar la ganancia distinto. Con una línea bajo costo, la pérdida descuenta el
// margen de ESA venta (600 − 300 = 300); antes las comisiones pisaban línea por
// línea y pagaban sobre 400.
test('el margen por venta es el mismo en el reporte y en las comisiones', () => {
  const mixta = orden({
    subtotalPyg: 600,
    totalPyg: 600,
    items: [
      { productId: 'p1', description: 'Bajo costo', quantity: 1, unitCostPyg: 200, totalPyg: 100 },
      { productId: 'p2', description: 'Rentable', quantity: 1, unitCostPyg: 100, totalPyg: 500 },
    ],
    payments: [{ status: 'CONFIRMED', amountPyg: 600 }],
  })
  const reporte = aggregateReport([mixta], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(reporte.totals.profitPyg, 300)
  const comisiones = aggregateCommissions([mixta], [{ userId: 'v1', percentPyg: 10 }])
  assert.equal(comisiones.sellers[0].marginPyg, 300)
  assert.equal(comisiones.sellers[0].commissionPyg, 30)
})

test('avisa cuando los importes exceden el rango permitido', () => {
  assert.throws(
    () => aggregateReport([orden({ subtotalPyg: 2147483647, totalPyg: 2147483647 }), orden({ id: 'b', subtotalPyg: 2147483647, totalPyg: 2147483647 })], { groupBy: 'day', offsetMinutes: DEFAULT_OFFSET_MINUTES }),
    ReportInputError,
  )
})

test('el tope de órdenes analizadas es explícito', () => {
  assert.equal(MAX_REPORT_ORDERS, 5000)
})

// #171 (fase 2 de #145): corte de pagos por cuenta/procesadora/medio y curva
// ABC en el servidor, para que la vista ejecutiva y la extendida compartan el
// mismo criterio sin recalcular en el navegador.

test('los pagos se agrupan por cuenta, procesadora o medio según paymentsBy', () => {
  const base = [
    orden({ id: 'a', payments: [{ status: 'CONFIRMED', amountPyg: 100000, method: 'CARD', accountName: 'Tarjeta Itaú', accountId: 'acc-1', processor: 'Bancard' }] }),
    orden({ id: 'b', payments: [{ status: 'CONFIRMED', amountPyg: 50000, method: 'CARD', accountName: 'Tarjeta Itaú', accountId: 'acc-1', processor: 'Bancard' }] }),
    orden({ id: 'c', payments: [{ status: 'CONFIRMED', amountPyg: 80000, method: 'TRANSFER', accountName: 'Itaú · Darío', accountId: 'acc-2', processor: null }] }),
    // Foto vieja sin cuenta: cae al medio.
    orden({ id: 'd', payments: [{ status: 'CONFIRMED', amountPyg: 20000, method: 'CASH' }] }),
  ]
  const porCuenta = aggregateReport(base, { groupBy: 'payments', offsetMinutes: DEFAULT_OFFSET_MINUTES, paymentsBy: 'account' })
  assert.deepEqual(porCuenta.groups.map((g) => [g.label, g.totalPyg]), [['Tarjeta Itaú', 150000], ['Itaú · Darío', 80000], ['CASH', 20000]])
  assert.equal(porCuenta.totals.totalPyg, 250000)

  const porProcesadora = aggregateReport(base, { groupBy: 'payments', offsetMinutes: DEFAULT_OFFSET_MINUTES, paymentsBy: 'processor' })
  assert.deepEqual(porProcesadora.groups.map((g) => [g.label, g.totalPyg]), [['Bancard', 150000], ['Sin procesadora', 100000]])

  const porMedio = aggregateReport(base, { groupBy: 'payments', offsetMinutes: DEFAULT_OFFSET_MINUTES, paymentsBy: 'method' })
  assert.deepEqual(porMedio.groups.map((g) => [g.label, g.totalPyg]), [['CARD', 150000], ['TRANSFER', 80000], ['CASH', 20000]])
  // Sin corte explícito, la cuenta sigue siendo el comportamiento histórico.
  const porDefecto = aggregateReport(base, { groupBy: 'payments', offsetMinutes: DEFAULT_OFFSET_MINUTES })
  assert.equal(porDefecto.groups[0].label, 'Tarjeta Itaú')
})

test('valida el corte de pagos y lo expone en la consulta', () => {
  const ok = parseReportQuery(new URLSearchParams('groupBy=payments&paymentsBy=processor'))
  assert.ok(ok.ok)
  if (ok.ok) assert.equal(ok.value.paymentsBy, 'processor')
  assert.equal(parseReportQuery(new URLSearchParams('paymentsBy=inventado')).ok, false)
})

test('la curva ABC acumula y clasifica por venta descendente', () => {
  const filas = [
    { key: 'p1', grossPyg: 80000 },
    { key: 'p2', grossPyg: 15000 },
    { key: 'p3', grossPyg: 4000 },
    { key: 'p4', grossPyg: 1000 },
  ]
  const conClase = curvaAbc(filas)
  assert.deepEqual(conClase.map((f) => [f.key, f.accumulatedPct, f.abcClass]), [
    ['p1', 80, 'A'],
    ['p2', 95, 'B'],
    ['p3', 99, 'C'],
    ['p4', 100, 'C'],
  ])
  // Sin ventas no se inventa una clase: todo queda en C con 0%.
  assert.deepEqual(curvaAbc([{ key: 'x', grossPyg: 0 }]).map((f) => [f.abcClass, f.accumulatedPct]), [['C', 0]])
  assert.deepEqual(curvaAbc([]), [])
})
