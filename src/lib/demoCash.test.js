import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) }
const { closeDemoCash, construirDemoCajas, getDemoCash, getDemoCashExpected, openDemoCash } = await import('./demoCash.js')

test('demo cash is versioned locally and closes with a numeric difference', () => {
  const opened = openDemoCash(500000, 'turno demo')
  assert.equal(opened.status, 'OPEN')
  assert.equal(getDemoCash().openingPyg, 500000)
  const closed = closeDemoCash(1200000, 1180000)
  assert.equal(closed.status, 'CLOSED')
  assert.equal(closed.differencePyg, 20000)
  assert.equal(getDemoCash().closedById, 'demo-user')
})

// #188: una caja abierta sin `openedAt` (seed viejo) se normaliza al leerla:
// el estado "Abierta" y la leyenda "Sin apertura" ya no se contradicen.
test('una caja demo abierta sin apertura se normaliza con el día de hoy', () => {
  store.set('mobos:demo-cash:v1', JSON.stringify({ id: 'demo-cash-session', openingPyg: 500000, status: 'OPEN', openedAt: null }))
  const cash = getDemoCash()
  assert.ok(cash.openedAt, 'la apertura queda definida')
  const apertura = new Date(cash.openedAt)
  const hoy = new Date()
  assert.equal(apertura.getFullYear(), hoy.getFullYear())
  assert.equal(apertura.getMonth(), hoy.getMonth())
  assert.equal(apertura.getDate(), hoy.getDate())
  assert.equal(cash.session.openedAt, cash.openedAt)
  // Una caja cerrada no inventa apertura.
  store.set('mobos:demo-cash:v1', JSON.stringify({ id: 'demo-cash-session', openingPyg: 500000, status: 'CLOSED', openedAt: null }))
  assert.equal(getDemoCash().openedAt, null)
})

test('el esperado de la caja demo cuenta la apertura y los cobros del día', () => {
  store.set('mobos:demo-cash:v1', JSON.stringify({ id: 'demo-cash-session', openingPyg: 500000, status: 'OPEN', openedAt: null }))
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86400000)
  const conHora = (base, hora) => { const d = new Date(base); d.setHours(hora, 0, 0, 0); return d.toISOString() }
  const finDelDia = new Date(hoy); finDelDia.setHours(23, 59, 59, 999)
  const ventas = [{ vendedorId: 'demo-user', pagos: [
    { medioPago: 'DINERO', monto: 100000, fecha: conHora(hoy, 10) },
    { medioPago: 'DINERO', monto: 50000, fecha: conHora(ayer, 16) },
    { medioPago: 'UENO BANK', monto: 30000, fecha: conHora(hoy, 11) },
  ] }]
  assert.equal(getDemoCashExpected(getDemoCash(), finDelDia, ventas), 600000)
})

// #148 §18: el corte por caja de la demo arma las sesiones del período con lo
// del responsable del turno y su esperado en vivo.
test('el corte por caja de la demo arma las sesiones del período', () => {
  const hoy = new Date()
  const clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const ventas = [
    { id: 'v1', fecha: clave, vendedorId: 'demo-user', precio: 300000, pagos: [{ medioPago: 'DINERO', monto: 300000 }] },
    { id: 'v2', fecha: clave, vendedorId: 'demo-user-vendedor', precio: 200000, pagos: [{ medioPago: 'DINERO', monto: 200000 }] },
  ]
  const sesiones = construirDemoCajas({ cash: { ...getDemoCash(), status: 'OPEN' }, ventas })
  assert.equal(sesiones.length, 3)
  const [turno, ...cerradas] = sesiones
  assert.equal(turno.status, 'OPEN')
  assert.equal(turno.pedidos, 1, 'solo cuenta los pedidos del responsable del turno')
  assert.equal(turno.efectivoPyg, 300000)
  assert.equal(turno.esperadoPyg, turno.openingPyg + turno.efectivoPyg + turno.movimientosPyg)
  assert.equal(turno.diferenciaPyg, null)
  for (const cerrada of cerradas) {
    assert.equal(cerrada.status, 'CLOSED')
    assert.equal(cerrada.contadoPyg, cerrada.esperadoPyg + cerrada.diferenciaPyg)
  }
  assert.notEqual(cerradas[0].diferenciaPyg, cerradas[1].diferenciaPyg, 'las cajas cerradas muestran diferencias distintas')
})
