import assert from 'node:assert/strict'
import test from 'node:test'

// #194: conciliación ficticia de la demo, con lotes guardados en el navegador.
const store = new Map()
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) }
const { construirDemoConciliacion, conciliarDemoLote, getDemoConciliacion } = await import('./demoConciliacion.js')

const HOY = new Date()
const clave = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const fechaHoy = (hora) => { const d = new Date(HOY); d.setHours(hora, 0, 0, 0); return d.toISOString() }
const AYER = new Date(HOY.getTime() - 86400000)
const fechaAyer = (hora) => { const d = new Date(AYER); d.setHours(hora, 0, 0, 0); return d.toISOString() }

const cuentas = [
  { id: 'demo-cash-pyg', name: 'Caja demo · Gs', kind: 'CASH', currency: 'PYG', holder: '', bank: '', processor: '' },
  { id: 'demo-transfer', name: 'Transferencia ficticia', kind: 'TRANSFER', currency: 'PYG', holder: 'Comercio ficticio demo', bank: 'Banco ficticio demo', processor: '' },
  { id: 'demo-card', name: 'Tarjeta demo', kind: 'CARD', currency: 'PYG', holder: '', bank: '', processor: 'Bancard' },
]
const ventas = [
  { id: 'demo-venta-hoy-full', fecha: clave(HOY), creadoEn: fechaHoy(10), cliente: 'María González', pagos: [{ id: 'pago-1', medioPago: 'DINERO', cuenta: 'Caja demo · Gs', monto: 6850000, fecha: fechaHoy(10) }] },
  { id: 'demo-venta-hoy-partial', fecha: clave(HOY), creadoEn: fechaHoy(11), cliente: 'Carlos Benítez', pagos: [
    { id: 'pago-2', medioPago: 'DINERO', cuenta: '', monto: 50000, fecha: fechaHoy(11) },
    { id: 'pago-3', medioPago: 'UENO BANK', cuenta: 'Transferencia ficticia', monto: 30000, fecha: fechaHoy(11) },
  ] },
  { id: 'demo-venta-ayer', fecha: clave(AYER), creadoEn: fechaAyer(16), cliente: 'Lucía Franco', pagos: [{ id: 'pago-4', medioPago: 'POS UENO', cuenta: 'Tarjeta demo', monto: 200000, fecha: fechaAyer(16) }] },
]

test('la conciliación demo reconoce los medios del sistema nuevo (#190)', () => {
  const ventasNuevas = [
    { id: 'demo-venta-pix', fecha: clave(HOY), creadoEn: fechaHoy(9), cliente: 'Ana Villalba', pagos: [{ id: 'pago-pix', medioPago: 'PIX', cuenta: 'Pix ficticio', monto: 1000000, fecha: fechaHoy(9) }] },
    { id: 'demo-venta-usdt', fecha: clave(HOY), creadoEn: fechaHoy(9), cliente: 'Ramiro Cáceres', pagos: [{ id: 'pago-usdt', medioPago: 'USDT - Cripto', cuenta: '', monto: 500000, fecha: fechaHoy(9) }] },
    { id: 'demo-venta-canje', fecha: clave(HOY), creadoEn: fechaHoy(9), cliente: 'Gloria Martínez', pagos: [{ id: 'pago-canje', medioPago: 'CANJE', cuenta: '', monto: 300000, fecha: fechaHoy(9) }] },
    { id: 'demo-venta-tarjeta', fecha: clave(HOY), creadoEn: fechaHoy(9), cliente: 'Juan Pereira', pagos: [{ id: 'pago-tarjeta', medioPago: 'TARJETA', cuenta: '', monto: 200000, fecha: fechaHoy(9) }] },
    { id: 'demo-venta-transfer', fecha: clave(HOY), creadoEn: fechaHoy(9), cliente: 'Estela Ramírez', pagos: [{ id: 'pago-transfer', medioPago: 'TRANSFERENCIA', cuenta: '', monto: 400000, fecha: fechaHoy(9) }] },
  ]
  const data = construirDemoConciliacion({ ventas: ventasNuevas, cuentas, desde: '2000-01-01', hasta: '2100-01-01' })
  const metodos = Object.fromEntries(data.items.map((item) => [item.id, item.method]))
  assert.deepEqual(metodos, {
    'pago-pix': 'PIX',
    'pago-usdt': 'CRYPTO',
    'pago-canje': 'TRADE_IN',
    'pago-tarjeta': 'CARD',
    'pago-transfer': 'TRANSFER',
  })
  assert.equal(data.items.filter((item) => item.method === 'CASH').length, 0, 'ningún medio nuevo cae en efectivo')
  assert.equal(data.porMedio.find((fila) => fila.key === 'CRYPTO').label, 'USDT - Cripto')
})

test('la conciliación demo agrupa cobros, cuentas y procesadoras', () => {
  const data = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01' })
  assert.equal(data.items.length, 4)
  assert.equal(data.resumen.confirmedPyg, 7130000)
  assert.equal(data.resumen.unverifiedPyg, 7130000)
  assert.equal(data.resumen.verifiedCount, 0)
  // #213: la demo arranca con un lote conciliado con diferencia (comisión bancaria).
  assert.equal(data.resumen.lotes, 1)
  assert.equal(data.items[0].orderNumber, 'AUR-0001')
  assert.equal(data.items[0].metodo, 'Efectivo')

  const efectivo = data.porMedio.find((fila) => fila.key === 'CASH')
  assert.equal(efectivo.confirmedPyg, 6900000)
  const transferencia = data.porCuenta.find((fila) => fila.key === 'demo-transfer')
  assert.equal(transferencia.label, 'Transferencia ficticia')
  assert.equal(transferencia.secondary, 'Comercio ficticio demo · Banco ficticio demo')
  const bancard = data.porProcesadora.find((fila) => fila.key === 'Bancard')
  assert.equal(bancard.confirmedPyg, 200000)
  // La procesadora de la cuenta manda; sin cuenta con procesadora, se usa la
  // del medio (POS UENO → UPay).
  assert.equal(data.items.find((item) => item.id === 'pago-4').procesadora, 'Bancard')
  const sinCuenta = construirDemoConciliacion({
    ventas: [{ id: 'v', fecha: clave(HOY), creadoEn: fechaHoy(12), pagos: [{ id: 'pago-5', medioPago: 'POS UENO', cuenta: '', monto: 100000, fecha: fechaHoy(12) }] }],
    cuentas,
    desde: '2000-01-01',
    hasta: '2100-01-01',
  })
  assert.equal(sinCuenta.items[0].procesadora, 'UPay')
})

test('la demo filtra por rango, cuenta, medio y procesadora', () => {
  const ayer = construirDemoConciliacion({ ventas, cuentas, desde: clave(AYER), hasta: clave(AYER) })
  assert.equal(ayer.items.length, 1)
  assert.equal(ayer.items[0].id, 'pago-4')
  const porCuenta = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01', accountId: 'demo-transfer' })
  assert.equal(porCuenta.items.length, 1)
  const porMedio = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01', method: 'CASH' })
  assert.equal(porMedio.items.length, 2)
  const porProcesadora = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01', processor: 'Bancard' })
  assert.equal(porProcesadora.items.length, 1)
})

test('conciliar el lote en la demo marca los pagos y guarda la diferencia', () => {
  const inicial = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01' })
  const seleccion = [inicial.items.find((item) => item.id === 'pago-2')]
  const lote = conciliarDemoLote({ items: seleccion, receivedPyg: 40000, note: 'Faltó Gs 10.000 del depósito' })
  assert.equal(lote.pagos, 1)
  assert.equal(lote.expectedPyg, 50000)
  assert.equal(lote.receivedPyg, 40000)
  assert.equal(lote.differencePyg, -10000)
  assert.equal(lote.estado, 'DIFFERENCE')

  const estado = getDemoConciliacion()
  assert.equal(estado.lotes.length, 2)
  assert.equal(estado.conciliados['pago-2'], lote.id)

  const despues = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01' })
  assert.equal(despues.items.find((item) => item.id === 'pago-2').conciliacion.state, 'VERIFIED')
  assert.equal(despues.resumen.verifiedPyg, 50000)
  assert.equal(despues.resumen.unverifiedPyg, 7080000)
  // El resumen suma el lote nuevo (-10.000) y el sembrado de la demo (-50.000).
  assert.equal(despues.resumen.differencePyg, -60000)
  assert.equal(despues.lotes[0].note, 'Faltó Gs 10.000 del depósito')
  // El pago sin cuenta cae al grupo por medio y ahí queda la diferencia.
  assert.equal(despues.porCuenta.find((fila) => fila.key === 'metodo:CASH').differencePyg, -10000)
})

test('un lote demo no puede mezclar cuentas, como en producción', () => {
  const inicial = construirDemoConciliacion({ ventas, cuentas, desde: '2000-01-01', hasta: '2100-01-01' })
  const mezcla = [inicial.items.find((item) => item.id === 'pago-1'), inicial.items.find((item) => item.id === 'pago-3')]
  assert.throws(() => conciliarDemoLote({ items: mezcla, receivedPyg: 100 }), /misma cuenta/)
})
