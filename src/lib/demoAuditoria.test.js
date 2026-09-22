import assert from 'node:assert/strict'
import test from 'node:test'

// #194: auditoría de caja ficticia de la demo (medios y efectivo).
const store = new Map()
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) }
const { construirDemoAuditoriaMedios, construirDemoAuditoriaEfectivo, guardarMarcaDemo, leerMarcasDemo } = await import('./demoAuditoria.js')

const HOY = new Date()
const clave = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const conHora = (hora) => { const d = new Date(HOY); d.setHours(hora, 0, 0, 0); return d.toISOString() }
const AYER = new Date(HOY.getTime() - 86400000)
const ayerConHora = (hora) => { const d = new Date(AYER); d.setHours(hora, 0, 0, 0); return d.toISOString() }

const ventas = [
  { id: 'v1', fecha: clave(HOY), cliente: 'María González', vendedorId: 'demo-user', pagos: [{ id: 'pago-1', medioPago: 'DINERO', monto: 6850000, fecha: conHora(10) }] },
  { id: 'v2', fecha: clave(HOY), cliente: 'Carlos Benítez', vendedorId: 'demo-user', pagos: [
    { id: 'pago-2', medioPago: 'DINERO', monto: 50000, fecha: conHora(11) },
    { id: 'pago-3', medioPago: 'UENO BANK', monto: 30000, fecha: conHora(11) },
  ] },
  { id: 'v3', fecha: clave(AYER), cliente: 'Lucía Franco', vendedorId: 'demo-user', pagos: [{ id: 'pago-4', medioPago: 'DINERO', monto: 100000, fecha: ayerConHora(16) }] },
]

test('la demo agrupa las entradas por medio del día elegido', () => {
  const { methods, totals } = construirDemoAuditoriaMedios({ ventas, fecha: clave(HOY) })
  assert.deepEqual(methods.map((fila) => [fila.method, fila.amountPyg, fila.count]), [['CASH', 6900000, 2], ['TRANSFER', 30000, 1]])
  assert.deepEqual(totals, { amountPyg: 6930000, count: 3 })
  const ayer = construirDemoAuditoriaMedios({ ventas, fecha: clave(AYER) })
  assert.equal(ayer.methods.length, 1)
  assert.equal(ayer.methods[0].amountPyg, 100000)
})

test('la demo arma la auditoría de efectivo con rango, caja y marcas', () => {
  const cash = { id: 'demo-cash-session', status: 'OPEN', openingPyg: 500000, openedAt: conHora(0) }
  const marcas = { 'PAYMENT:pago-1': { status: 'VERIFIED', note: '', auditadoPor: 'Dueño demo', auditedAt: conHora(12) } }
  const data = construirDemoAuditoriaEfectivo({ ventas, cash, desde: clave(HOY), hasta: clave(HOY), marcas })
  assert.equal(data.operaciones.length, 2, 'solo los cobros en efectivo del rango')
  assert.equal(data.operaciones[0].montoPyg, 50000, 'ordenadas de más reciente a más antigua')
  assert.equal(data.operaciones[1].status, 'VERIFIED')
  assert.equal(data.operaciones[1].auditadoPor, 'Dueño demo')
  assert.equal(data.operaciones[0].pedido, 'AUR-0002')
  assert.equal(data.resumen.aperturaPyg, 500000)
  assert.equal(data.resumen.recibidoPyg, 6900000)
  assert.equal(data.resumen.esperadoPyg, 7400000)
  assert.equal(data.resumen.diferenciaPyg, 0)
  assert.equal(data.resumen.verificadas, 1)
  assert.equal(data.resumen.pendientes, 1)
  assert.equal(data.sesiones.length, 1)
})

test('la demo guarda y lee las marcas de auditoría', () => {
  const marca = guardarMarcaDemo('MOVEMENT', 'mov-1', { status: 'DIFFERENCE', note: 'Faltó vuelto', auditadoPor: 'Dueño demo', auditedAt: conHora(13) })
  assert.equal(marca.status, 'DIFFERENCE')
  const marcas = leerMarcasDemo()
  assert.equal(marcas['MOVEMENT:mov-1'].note, 'Faltó vuelto')
  assert.equal(marcas['PAYMENT:pago-1'], undefined)
})
