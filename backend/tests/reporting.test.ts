import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_OFFSET_MINUTES,
  MAX_REPORT_ORDERS,
  ReportInputError,
  aggregateReport,
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

test('avisa cuando los importes exceden el rango permitido', () => {
  assert.throws(
    () => aggregateReport([orden({ subtotalPyg: 2147483647, totalPyg: 2147483647 }), orden({ id: 'b', subtotalPyg: 2147483647, totalPyg: 2147483647 })], { groupBy: 'day', offsetMinutes: DEFAULT_OFFSET_MINUTES }),
    ReportInputError,
  )
})

test('el tope de órdenes analizadas es explícito', () => {
  assert.equal(MAX_REPORT_ORDERS, 5000)
})
