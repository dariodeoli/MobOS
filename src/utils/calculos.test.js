import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calcularGanancia,
  calcularGananciaDia,
  claveAyer,
  cobradoDeVenta,
  fechaClave,
  fechaClaveParaguay,
  presetParaguay,
  productosGanadores,
  ticketPromedio,
  variacion,
} from './calculos.js'

// #145: red de seguridad de los cálculos que comparten el Resumen ejecutivo y
// el Análisis extendido. Fijan el comportamiento actual antes de migrar las
// pantallas al backend de métricas único.

test('variacion: null sin base comparable y porcentaje con signo', () => {
  assert.equal(variacion(150, 0), null)
  assert.equal(variacion(150, -10), null)
  assert.equal(variacion(150, 100), 50)
  assert.equal(variacion(75, 100), -25)
  // Sin cambio real: 0%, no null (la base existe).
  assert.equal(variacion(100, 100), 0)
})

test('ticketPromedio: 0 sin operaciones, nunca NaN', () => {
  assert.equal(ticketPromedio(0, 0), 0)
  assert.equal(ticketPromedio(500000, 0), 0)
  assert.equal(ticketPromedio(500000, 2), 250000)
})

test('cobradoDeVenta: solo los pagos confirmados suman cobro', () => {
  // Ventas con array de pagos (modo API): PENDING/REJECTED no cuentan.
  assert.equal(cobradoDeVenta({ precio: 100000, pagos: [{ monto: 60000, status: 'CONFIRMED' }, { monto: 40000, status: 'PENDING' }] }), 60000)
  // Sin status se asume confirmado (compatibilidad).
  assert.equal(cobradoDeVenta({ precio: 100000, pagos: [{ monto: 100000 }] }), 100000)
  // Legado/demo: cae a estadoPago y totalPagado.
  assert.equal(cobradoDeVenta({ precio: 100000, estadoPago: 'Pagado', totalPagado: 80000 }), 80000)
  assert.equal(cobradoDeVenta({ precio: 100000, estadoPago: 'Pendiente' }), 0)
  assert.equal(cobradoDeVenta({ precio: 100000, estadoPago: 'Pagado' }), 100000)
})

test('calcularGanancia: ingresos − costo − gastos − ads del período', () => {
  const hoy = fechaClave()
  const ayer = claveAyer()
  const ventas = [
    { fecha: hoy, precio: 200000, precioCosto: 120000, productoId: 'p1' },
    { fecha: hoy, precio: 100000, productoId: 'p2' },
    { fecha: ayer, precio: 50000, precioCosto: 10000, productoId: 'p2' },
  ]
  const gastos = [{ fecha: hoy, monto: 30000 }, { fecha: ayer, monto: 99999 }]
  const ads = [{ fecha: hoy, monto: 10000 }]
  const prodsById = { p2: { precioCosto: 40000 } }
  const g = calcularGanancia('dia', { ventas, gastos, ads, prodsById })
  assert.equal(g.ingresos, 300000)
  // p1 usa el costo foto; p2 cae al costo actual del catálogo.
  assert.equal(g.costoMercaderia, 160000)
  assert.equal(g.totalGastos, 30000)
  assert.equal(g.totalAds, 10000)
  assert.equal(g.ganancia, 100000)
  assert.equal(g.estado, 'ganancia')
  assert.equal(g.cantVentas, 2)

  const perdida = calcularGanancia('dia', { ventas: [{ fecha: hoy, precio: 1000, precioCosto: 5000 }], gastos: [], ads: [], prodsById: {} })
  assert.equal(perdida.ganancia, -4000)
  assert.equal(perdida.estado, 'perdida')
  assert.equal(calcularGanancia('dia', { ventas: [], gastos: [], ads: [], prodsById: {} }).estado, 'empate')
})

test('calcularGananciaDia: día exacto y estado vacío', () => {
  const hoy = fechaClave()
  const datos = {
    ventas: [{ fecha: hoy, precio: 100000, precioCosto: 40000, productoId: 'p1' }],
    gastos: [{ fecha: hoy, monto: 5000 }],
    ads: [{ fecha: hoy, monto: 5000 }],
    prodsById: {},
  }
  const dia = calcularGananciaDia(hoy, datos)
  assert.equal(dia.ingresos, 100000)
  assert.equal(dia.ganancia, 50000)
  assert.equal(dia.estado, 'ganancia')
  assert.equal(dia.cantVentas, 1)

  const vacio = calcularGananciaDia('2026-01-01', datos)
  assert.equal(vacio.estado, 'vacio')
  assert.equal(vacio.ganancia, 0)
})

test('productosGanadores: agrupa por producto, ordena por cantidad y corta con el límite', () => {
  const hoy = fechaClave()
  const ventas = [
    { fecha: hoy, precio: 100000, productoId: 'p1' },
    { fecha: hoy, precio: 120000, productoId: 'p1' },
    { fecha: hoy, precio: 50000, productoId: 'p2' },
  ]
  const top = productosGanadores('dia', ventas, { p1: { nombre: 'iPhone' }, p2: { nombre: 'Funda' } }, 5)
  assert.deepEqual(top, [
    { id: 'p1', nombre: 'iPhone', cantidad: 2, monto: 220000, ganancia: null, margenPct: null, sinCosto: 2 },
    { id: 'p2', nombre: 'Funda', cantidad: 1, monto: 50000, ganancia: null, margenPct: null, sinCosto: 1 },
  ])
  assert.equal(productosGanadores('dia', ventas, {}, 1).length, 1)
})

test('productosGanadores: con foto de costo ordena por ganancia y no inventa margen', () => {
  const hoy = fechaClave()
  const ventas = [
    { fecha: hoy, precio: 300000, precioCosto: 100000, productoId: 'p1' },
    { fecha: hoy, precio: 200000, precioCosto: 180000, productoId: 'p1' },
    { fecha: hoy, precio: 500000, precioCosto: 450000, productoId: 'p2' },
    { fecha: hoy, precio: 400000, productoId: 'p3' },
  ]
  const top = productosGanadores('dia', ventas, {
    p1: { nombre: 'iPhone' }, p2: { nombre: 'Funda' }, p3: { nombre: 'Cable' },
  }, 5, { criterio: 'ganancia' })
  assert.deepEqual(top.map((f) => [f.nombre, f.ganancia, f.margenPct]), [
    ['iPhone', 220000, 44],
    ['Funda', 50000, 10],
    ['Cable', null, null],
  ])
  assert.equal(top[2].sinCosto, 1)
})

// La API interpreta desde/hasta como días de Paraguay (UTC-3): si el atajo
// sale del reloj del navegador, un runner en UTC pide «hoy» con otro día y la
// conciliación del día pierde los cobros recién hechos (#244, CI rojo).
test('presetParaguay: los atajos usan el día de Paraguay, no el del navegador', () => {
  // 00:35 UTC del 23/9 todavía es 22/9 en Paraguay (21:35).
  assert.equal(fechaClaveParaguay('2026-09-23T00:35:00Z'), '2026-09-22')
  assert.deepEqual(presetParaguay('hoy', '2026-09-23T00:35:00Z'), { desde: '2026-09-22', hasta: '2026-09-22' })
  assert.deepEqual(presetParaguay('ayer', '2026-09-23T00:35:00Z'), { desde: '2026-09-21', hasta: '2026-09-21' })
  assert.deepEqual(presetParaguay('7d', '2026-09-23T00:35:00Z'), { desde: '2026-09-16', hasta: '2026-09-22' })
  assert.deepEqual(presetParaguay('mes', '2026-09-23T00:35:00Z'), { desde: '2026-09-01', hasta: '2026-09-22' })
  // A las 03:00 UTC ya es el 23 en Paraguay.
  assert.deepEqual(presetParaguay('hoy', '2026-09-23T03:00:00Z'), { desde: '2026-09-23', hasta: '2026-09-23' })
  // Fin de mes paraguayo: 30/9 23:00 aunque en UTC ya sea 1/10.
  assert.deepEqual(presetParaguay('mes', '2026-10-01T02:00:00Z'), { desde: '2026-09-01', hasta: '2026-09-30' })
  assert.deepEqual(presetParaguay('mesAnt', '2026-10-01T02:00:00Z'), { desde: '2026-08-01', hasta: '2026-08-31' })
  assert.deepEqual(presetParaguay('trim', '2026-10-01T02:00:00Z'), { desde: '2026-07-01', hasta: '2026-09-30' })
  assert.deepEqual(presetParaguay('anio', '2026-10-01T02:00:00Z'), { desde: '2026-01-01', hasta: '2026-09-30' })
  assert.equal(presetParaguay('sin-preset', '2026-09-23T00:35:00Z'), null)
})
