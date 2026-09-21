import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketCierreCaja, ticketResumenDia } from './reportes.js'
import { armarCierreCaja, cobrosDeAuditoria, cobrosDePagos } from '../../utils/reporteCaja.js'
import { armarResumenDia } from '../../utils/reporteResumen.js'

const cierreBase = () => armarCierreCaja({
  cash: {
    status: 'CLOSED',
    openingPyg: 500000,
    expectedPyg: 800000,
    countedPyg: 780000,
    differencePyg: -20000,
    openedAt: '2026-09-20T10:00:00Z',
    closedAt: '2026-09-20T20:00:00Z',
    notes: 'Turno mañana',
  },
  movimientos: [
    { id: 'm1', kind: 'EXPENSE', direction: 'OUT', amountPyg: 50000, description: 'Compra de bolsas', createdAt: '2026-09-20T12:00:00Z', account: { name: 'Caja chica' } },
    { id: 'm2', kind: 'ADJUSTMENT', direction: 'IN', amountPyg: 10000, description: 'Ajuste de caja', createdAt: '2026-09-20T13:00:00Z' },
    { id: 'm3', kind: 'EXPENSE', direction: 'OUT', amountPyg: 999999, description: 'Movimiento de otra sesión', createdAt: '2026-09-19T09:00:00Z' },
  ],
  cobros: cobrosDeAuditoria([{ method: 'CASH', amountPyg: 300000, count: 4 }, { method: 'TRANSFER', amountPyg: 120000, count: 1 }]),
  empresa: 'MobOS',
  sucursal: 'Central',
  usuario: 'Dario',
})

test('el cierre imprime apertura, cobros por medio, movimientos de la sesión, esperado/contado/diferencia y firma', () => {
  const cierre = cierreBase()
  const texto = ticketCierreCaja(cierre, { ancho: 80 }).lineas().join('')
  assert.ok(texto.includes('CIERRE DE CAJA'))
  assert.ok(texto.includes('MobOS'))
  assert.ok(texto.includes('Central'))
  assert.ok(texto.includes('Dario'))
  assert.ok(texto.includes('Turno mañana'))
  assert.ok(texto.includes('Gs 500.000'), 'apertura')
  assert.ok(texto.includes('Efectivo'), 'cobro por efectivo')
  assert.ok(texto.includes('Transferencia'), 'cobro por transferencia')
  assert.ok(texto.includes('Gs 420.000'), 'total cobrado')
  assert.ok(texto.includes('Compra de bolsas'), 'movimiento de la sesión')
  assert.ok(!texto.includes('Movimiento de otra sesión'), 'no mezcla movimientos fuera de la sesión')
  assert.ok(texto.includes('ESPERADO'))
  assert.ok(texto.includes('Gs 800.000'), 'esperado')
  assert.ok(texto.includes('Contado'))
  assert.ok(texto.includes('Gs 780.000'), 'contado')
  assert.ok(texto.includes('DIFERENCIA'))
  assert.ok(texto.includes('Gs -20.000'), 'diferencia')
  assert.ok(texto.includes('Responsable del arqueo:'), 'firma del arqueo')
  assert.ok(texto.includes('Control:'), 'firma de control')
  assert.ok(texto.includes('Aclaración:'), 'aclaración para escribir a mano')
  assert.ok(texto.includes('Observaciones:'), 'área de observaciones')

  // En 58 mm las etiquetas largas no se cortan (antes: "E Gs 3.700.000").
  const lineas58 = ticketCierreCaja(cierre, { ancho: 58 }).lineas()
  const texto58 = lineas58.join('')
  assert.ok(texto58.includes('ESPERADO'), 'esperado completo en 58 mm')
  assert.ok(texto58.includes('DIFERENCIA'), 'diferencia completa en 58 mm')
  assert.ok(texto58.includes('Gs 420.000'), 'total cobrado completo en 58 mm')
  for (const linea of lineas58) assert.ok(linea.length <= 33, `sin desborde en 58 mm: "${linea}"`)
})

test('la diferencia se calcula igual que la pantalla aunque no venga explícita', () => {
  const cierre = armarCierreCaja({ cash: { status: 'CLOSED', openingPyg: 100, expectedPyg: 300, countedPyg: 280 } })
  assert.equal(cierre.diferencia, -20)
  assert.ok(ticketCierreCaja(cierre, { ancho: 58 }).lineas().join('').includes('Gs -20'))
})

test('los cobros locales se agrupan por medio y DINERO es Efectivo', () => {
  const cobros = cobrosDePagos([
    { medioPago: 'DINERO', monto: 100000 },
    { medioPago: 'DINERO', monto: 50000 },
    { method: 'CARD', amountPyg: 200000 },
  ])
  assert.equal(cobros.find((fila) => fila.method === 'CASH')?.montoPyg, 150000)
  assert.equal(cobros.find((fila) => fila.method === 'CASH')?.count, 2)
  assert.equal(cobros.find((fila) => fila.method === 'CARD')?.label, 'Tarjeta / POS')
})

test('el resumen del día imprime ventas, ticket promedio, más vendidos, cobrado y pendiente', () => {
  const ventas = [
    {
      fecha: '2026-09-20',
      precio: 1000000,
      vendedorId: 'v1',
      medioPago: 'CASH',
      estadoPago: 'Pagado',
      items: [
        { productId: 'p1', description: 'iPhone 15', quantity: 1, unitPricePyg: 900000, totalPyg: 900000 },
        { productId: 'p2', description: 'Funda', quantity: 2, unitPricePyg: 50000, totalPyg: 100000 },
      ],
    },
    {
      fecha: '2026-09-20',
      precio: 500000,
      vendedorId: 'v1',
      medioPago: 'TRANSFER',
      estadoPago: 'Pendiente',
      items: [{ productId: 'p2', description: 'Funda', quantity: 3, unitPricePyg: 50000, totalPyg: 150000 }],
      pagos: [{ status: 'CONFIRMED', monto: 200000 }],
    },
  ]
  const resumen = armarResumenDia({ ventas, prods: {}, vendedoresById: { v1: 'Ana' }, rango: { desde: '2026-09-20', hasta: '2026-09-20' }, prev: { desde: '2026-09-19', hasta: '2026-09-19' } })
  assert.equal(resumen.ventas, 2)
  assert.equal(resumen.act.length, 2)
  assert.equal(resumen.total, 1500000)
  assert.equal(resumen.ticket, 750000)
  assert.equal(resumen.cobrado, 1200000)
  assert.equal(resumen.pendiente, 300000)
  assert.equal(resumen.topProductos[0].nombre, 'Funda')
  assert.equal(resumen.topProductos[0].cantidad, 5)
  const texto = ticketResumenDia({ ...resumen, empresa: 'MobOS', etiqueta: 'Hoy' }, { ancho: 80 }).lineas().join('')
  assert.ok(texto.includes('RESUMEN DEL DÍA'))
  assert.ok(texto.includes('Hoy'))
  assert.ok(texto.includes('Gs 1.500.000'), 'facturado')
  assert.ok(texto.includes('Gs 750.000'), 'ticket promedio')
  assert.ok(texto.includes('Funda'), 'producto más vendido')
  assert.ok(texto.includes('Cobrado'))
  assert.ok(texto.includes('Pendiente'))
  assert.ok(texto.includes('Responsable:'), 'firma del responsable')
  assert.ok(texto.includes('Control:'), 'firma de control')
  assert.ok(texto.includes('Aclaración:'), 'aclaración para escribir a mano')
  assert.ok(texto.includes('Observaciones:'), 'área de observaciones')

  // El resumen en 58 mm no pierde el facturado ni la etiqueta FACTURADO.
  const texto58 = ticketResumenDia({ ...resumen, empresa: 'MobOS', etiqueta: 'Hoy' }, { ancho: 58 }).lineas().join('')
  assert.ok(texto58.includes('FACTURADO'), 'etiqueta completa en 58 mm')
  assert.ok(texto58.includes('Gs 1.500.000'), 'facturado en 58 mm')
})
