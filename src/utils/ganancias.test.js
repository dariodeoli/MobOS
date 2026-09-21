import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularGanancia, calcularGananciaDia, fechaClave } from './calculos.js'
import {
  aplicarSeguro,
  estadoDeGanancia,
  gananciaDeRango,
  gananciaDelDia,
  gananciaDelPeriodo,
  lineasDeGanancia,
  serieDeReporte,
} from './ganancias.js'

// #181: los cálculos de Ganancias viven en un solo lugar y los consumen la
// vista, el calendario compartido y Reportes. Estos tests congelan que los
// números no cambien: sin API el resultado es idéntico al cálculo local.

const hoy = fechaClave()
const datos = {
  ventas: [{ fecha: hoy, precio: 200000, precioCosto: 120000, productoId: 'p1' }],
  gastos: [{ fecha: hoy, monto: 30000 }],
  ads: [{ fecha: hoy, monto: 10000 }],
  prodsById: {},
}

test('sin API, el período y el día son idénticos al cálculo local de siempre', () => {
  assert.deepEqual(gananciaDelPeriodo('dia', datos, null), calcularGanancia('dia', datos))
  assert.deepEqual(gananciaDelDia(hoy, datos, null), calcularGananciaDia(hoy, datos))
})

test('con API, ingresos y costo salen del reporte y gastos/publicidad de Finanzas', () => {
  const g = gananciaDelPeriodo('dia', datos, { totalPyg: 315000, costPyg: 140000, orders: 7 })
  assert.equal(g.ingresos, 315000)
  assert.equal(g.costoMercaderia, 140000)
  assert.equal(g.totalGastos, 30000)
  assert.equal(g.totalAds, 10000)
  assert.equal(g.ganancia, 135000)
  assert.equal(g.estado, 'ganancia')
  assert.equal(g.cantVentas, 7)
  assert.equal(gananciaDelPeriodo('dia', datos, { totalPyg: 0, costPyg: 0, orders: 0 }).estado, 'perdida')
  assert.equal(gananciaDelPeriodo('dia', { ...datos, gastos: [], ads: [] }, { totalPyg: 0, costPyg: 0, orders: 0 }).estado, 'empate')
})

test('el día consulta el reporte dentro del rango y la caché fuera de él', () => {
  const serieApi = { desde: hoy, hasta: hoy, porDia: new Map([[hoy, { key: hoy, totalPyg: 315000, costPyg: 140000, orders: 7 }]]) }
  const enRango = gananciaDelDia(hoy, datos, serieApi)
  assert.equal(enRango.ingresos, 315000)
  assert.equal(enRango.costoMercaderia, 140000)
  assert.equal(enRango.ganancia, 135000)
  assert.equal(enRango.cantVentas, 7)

  // Un día fuera del rango del reporte vuelve a la caché local.
  const fuera = gananciaDelDia('2026-01-15', datos, serieApi)
  assert.deepEqual(fuera, calcularGananciaDia('2026-01-15', datos))

  // Dentro del rango sin grupo ni gastos: sin movimiento.
  const vacio = gananciaDelDia('2026-09-20', { ...datos, gastos: [], ads: [] }, { desde: '2026-09-01', hasta: '2026-09-30', porDia: new Map() })
  assert.equal(vacio.estado, 'vacio')
  assert.equal(vacio.ganancia, 0)
})

test('el rango (vista extendida) usa el reporte y acota gastos y publicidad', () => {
  assert.equal(gananciaDeRango({ desde: hoy, hasta: hoy }, datos, null), null)
  const g = gananciaDeRango({ desde: hoy, hasta: hoy }, datos, { totalPyg: 500000, costPyg: 200000, orders: 3 })
  assert.equal(g.ingresos, 500000)
  assert.equal(g.costoMercaderia, 200000)
  assert.equal(g.totalGastos, 30000)
  assert.equal(g.totalAds, 10000)
  assert.equal(g.ganancia, 260000)
  // Un gasto fuera del rango no cuenta.
  const fuera = { ...datos, gastos: [...datos.gastos, { fecha: '2020-01-01', monto: 999999 }] }
  assert.equal(gananciaDeRango({ desde: hoy, hasta: hoy }, fuera, { totalPyg: 0, costPyg: 0, orders: 0 }).totalGastos, 30000)
})

test('el desglose conserva etiquetas y el override del costo', () => {
  const g = { ingresos: 100, costoMercaderia: 40, totalGastos: 10, totalAds: 5, ganancia: 45 }
  assert.deepEqual(lineasDeGanancia(g).map((l) => l.label), ['Ingresos por ventas', 'Costo de mercadería vendida', 'Gastos', 'Meta Ads'])
  assert.equal(lineasDeGanancia(g, { costo: 'Costo de mercadería' })[1].label, 'Costo de mercadería')
  assert.deepEqual(lineasDeGanancia(null), [])
})

test('la serie del reporte arma el mapa por día y expone el rango', () => {
  const serie = serieDeReporte({
    from: '2026-09-01', to: '2026-09-30',
    totals: { totalPyg: 100, costPyg: 40, orders: 1 },
    groups: [{ key: '2026-09-21', totalPyg: 100, costPyg: 40, orders: 1 }],
  })
  assert.equal(serie.desde, '2026-09-01')
  assert.equal(serie.hasta, '2026-09-30')
  assert.equal(serie.totales.totalPyg, 100)
  assert.equal(serie.porDia.get('2026-09-21').costPyg, 40)
  assert.deepEqual(serieDeReporte(null), { totales: null, desde: '', hasta: '', porDia: new Map() })
})

test('estado: ganancia, pérdida y empate', () => {
  assert.equal(estadoDeGanancia(1), 'ganancia')
  assert.equal(estadoDeGanancia(-1), 'perdida')
  assert.equal(estadoDeGanancia(0), 'empate')
})

// #194: la demo muestra el seguro aplicado al margen (costo real = costo + %).
test('aplicarSeguro: costo real y resultado con el ejemplo de la spec', () => {
  const base = { ingresos: 150000, costoMercaderia: 100000, totalGastos: 0, totalAds: 0, ganancia: 50000, estado: 'ganancia' }
  const conSeguro = aplicarSeguro(base, 25)
  assert.equal(conSeguro.costoMercaderia, 125000)
  assert.equal(conSeguro.ganancia, 25000)
  assert.equal(conSeguro.estado, 'ganancia')
  assert.equal(conSeguro.seguroPct, 25)
  // Sin seguro (0, null o vacío) no se toca el resultado.
  for (const pct of [0, null, undefined, '']) assert.equal(aplicarSeguro(base, pct), base)
  // Un seguro grande puede dar pérdida.
  assert.equal(aplicarSeguro({ ...base, ingresos: 110000 }, 25).estado, 'perdida')
  // Redondeo a guaraníes enteros.
  assert.equal(aplicarSeguro({ ...base, costoMercaderia: 33333 }, 10).costoMercaderia, 36666)
})
