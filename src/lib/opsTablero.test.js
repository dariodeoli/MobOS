import test from 'node:test'
import assert from 'node:assert/strict'
import { checklistDe, colasDelTaller, equiposEnProceso, imeiConsultable, kpisOps, locksDe, locksDeConsulta, pasosDelLote, resumenOps } from './opsTablero.js'

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

test('el «x de y» del checklist sale de la inspección y sin ítems queda null', () => {
  const conItems = unidad('9', { inspection: { items: { a: { estado: 'pasa' }, b: { estado: 'pasa' }, c: { estado: 'falla' }, d: { estado: '' } } } })
  assert.deepEqual(checklistDe(conItems), { pasan: 2, fallan: 1, revisados: 3, total: 4, porcentaje: 50 })
  assert.equal(checklistDe(unidad('10', {})), null, 'sin inspección no hay checklist')
})

test('los locks se arman desde la consulta IMEI guardada y sin datos quedan null', () => {
  const conConsulta = unidad('11', { inspection: { verificacion: { normalized: [{ clave: 'findMy', valor: 'off' }, { clave: 'mdm', valor: 'off' }, { clave: 'blacklist', valor: 'clean' }, { clave: 'simLock', valor: 'unlocked' }] } } })
  const chips = locksDe(conConsulta)
  assert.equal(chips.length, 4)
  assert.ok(chips.every((chip) => chip.estado === 'libre'))
  const conActivo = unidad('12', { inspection: { verificacion: { campos: [{ clave: 'findMy', valor: 'on' }] } } })
  assert.deepEqual(locksDe(conActivo), [{ clave: 'icloud', estado: 'activo', detalle: 'iCloud: on' }])
  assert.equal(locksDe(unidad('13', {})), null, 'sin consulta no se inventan locks')
})

test('el stepper del lote lleva la carga de cada etapa', () => {
  const pasos = pasosDelLote({ porVerificar: 3, verificados: 2, listos: 1 })
  assert.deepEqual(pasos.map(({ clave, total }) => [clave, total]), [['por-verificar', 3], ['verificado', 2], ['listo', 1]])
  assert.deepEqual(pasosDelLote({}).map((paso) => paso.total), [0, 0, 0])
})

test('solo los IMEI de 15 dígitos se consultan (el backend ignora el filtro si no valida)', () => {
  assert.equal(imeiConsultable('490154203237518'), true)
  assert.equal(imeiConsultable('E2EE2E1IPHONE15MUDJ2R9X1'), false)
  assert.equal(imeiConsultable('49015420323751'), false)
  assert.equal(imeiConsultable(''), false)
})

test('los chips de locks salen de la consulta IMEI guardada y validan la máscara', () => {
  const consulta = { imei: '•••••••••••7518', normalized: [{ clave: 'findMy', valor: 'off' }, { clave: 'mdm', valor: 'off' }, { clave: 'blacklist', valor: 'Sin reportes actuales' }, { clave: 'simLock', valor: 'Unlocked' }] }
  const chips = locksDeConsulta(consulta, '490154203237518')
  assert.equal(chips.length, 4)
  assert.ok(chips.every((chip) => chip.estado === 'libre'), 'la consulta limpia deja los cuatro chips en verde')
  assert.equal(locksDeConsulta(consulta, '490154203237999'), null, 'la máscara de otro equipo no se muestra')
  assert.equal(locksDeConsulta({ imei: consulta.imei, normalized: [] }, '490154203237518'), null, 'sin campos normalizados no hay chips')
  assert.equal(locksDeConsulta(null, '490154203237518'), null)
})

test('equiposEnProceso alterna por verificar y verificados (el taller en curso)', () => {
  const equipos = equiposEnProceso([POR_VERIFICAR, OTRA_POR_VERIFICAR, VERIFICADA, unidad('5', {})], 4)
  assert.deepEqual(equipos.map((equipo) => [equipo.id, equipo.estado]), [
    ['3', 'por-verificar'], // primera de la fila de entrada
    ['4', 'verificado'], // inspeccionada con grado B: ya está verificada
    ['5', 'por-verificar'], // siguiente de la fila
    ['2', 'verificado'], // verificada sin inspección
  ])
})
