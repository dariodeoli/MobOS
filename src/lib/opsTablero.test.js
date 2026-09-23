import test from 'node:test'
import assert from 'node:assert/strict'
import { colasDelTaller, equiposEnProceso, kpisOps, resumenOps } from './opsTablero.js'

// Fixtures del tablero F3 (#241): una unidad por estado del rack.
const unidad = (id, extra = {}) => ({ id, serial: `AUR000${id}0000000`, product: { name: `Equipo ${id}` }, ...extra })
const LISTA = unidad('1', { costPyg: 100, lastVerifiedAt: new Date().toISOString() })
const VERIFICADA = unidad('2', { lastVerifiedAt: new Date().toISOString() })
const POR_VERIFICAR = unidad('3', {})
const OTRA_POR_VERIFICAR = unidad('4', { inspection: { grado: 'B', puntaje: 70 } })

const pago = (monto, paidAt, status = 'CONFIRMED') => ({ amountPyg: monto, paidAt, status })

test('resumenOps cuenta cobros y pedidos de hoy y deja afuera los de ayer', () => {
  const ahora = new Date('2026-09-22T15:00:00')
  const pedidos = [
    { id: 'a', createdAt: '2026-09-22T09:00:00', totalPyg: 100000, status: 'COMPLETED', payments: [pago(100000, '2026-09-22T09:05:00')] },
    { id: 'b', createdAt: '2026-09-22T10:00:00', totalPyg: 50000, status: 'PENDING', payments: [pago(20000, '2026-09-22T10:10:00')] },
    { id: 'c', createdAt: '2026-09-21T18:00:00', totalPyg: 90000, status: 'COMPLETED', payments: [pago(90000, '2026-09-21T18:05:00')] },
    { id: 'd', createdAt: '2026-09-22T11:00:00', totalPyg: 30000, status: 'CANCELLED', payments: [] },
    // Cobro de hoy sobre un pedido viejo: cuenta el ingreso, no el pedido.
    { id: 'e', createdAt: '2026-09-20T12:00:00', totalPyg: 80000, status: 'PENDING', payments: [pago(80000, '2026-09-22T12:30:00')] },
    // Pendiente de acreditación: no suma.
    { id: 'f', createdAt: '2026-09-22T13:00:00', totalPyg: 70000, status: 'PENDING', payments: [pago(70000, '2026-09-22T13:10:00', 'PENDING')] },
  ]
  const r = resumenOps({ unidades: [LISTA, VERIFICADA, POR_VERIFICAR, OTRA_POR_VERIFICAR], pedidos, ahora })
  assert.equal(r.cobradoPyg, 200000)
  assert.equal(r.pagosHoy, 3)
  assert.equal(r.pedidosHoy, 3)
  assert.equal(r.pedidosPagados, 1)
  assert.equal(r.pedidosPendientes, 2)
  assert.equal(r.porVerificar, 1)
  assert.equal(r.verificados, 2)
  assert.equal(r.listos, 1)
  assert.equal(r.enTaller, 3)
})

test('kpisOps arma los cuatro KPIs con números formateados', () => {
  const kpis = kpisOps(resumenOps({ unidades: [LISTA, VERIFICADA, POR_VERIFICAR], pedidos: [] }))
  assert.deepEqual(kpis.map((kpi) => kpi.label), ['Cobrado hoy', 'Pedidos hoy', 'En taller', 'Listos para vender'])
  const cobrado = kpis.find((kpi) => kpi.clave === 'cobrado')
  assert.match(cobrado.valor, /^Gs\s?0$/)
  assert.match(kpis.find((kpi) => kpi.clave === 'pedidos').detalle, /0 pagados · 0 pendientes/)
  assert.equal(kpis.find((kpi) => kpi.clave === 'taller').valor, '2')
  assert.equal(kpis.find((kpi) => kpi.clave === 'listos').valor, '1')
})

test('equiposEnProceso excluye los listos y respeta el límite', () => {
  const equipos = equiposEnProceso([LISTA, VERIFICADA, POR_VERIFICAR], 1)
  assert.equal(equipos.length, 1)
  assert.equal(equipos[0].id, '3')
  assert.equal(equipos[0].estado, 'por-verificar')
  assert.equal(equipos[0].modelo, 'Equipo 3')
  assert.equal(equipos[0].serial, 'AUR00030000000')
})

test('colasDelTaller agrupa por estado con totales y textos cortos', () => {
  const colas = colasDelTaller([LISTA, VERIFICADA, POR_VERIFICAR, OTRA_POR_VERIFICAR], 1)
  assert.deepEqual(colas.map((cola) => cola.estado), ['por-verificar', 'verificado', 'listo'])
  assert.equal(colas[0].total, 1)
  assert.equal(colas[0].items.length, 1)
  assert.equal(colas[0].titulo, 'Por verificar')
  assert.match(colas[0].items[0].texto, /^Equipo \d · \d{4}$/)
  assert.equal(colas[1].total, 2)
  assert.equal(colas[2].total, 1)
})
