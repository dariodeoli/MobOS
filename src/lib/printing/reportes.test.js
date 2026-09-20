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
  assert.ok(texto.includes('Firma del responsable'), 'espacio de firma')
})

test('la diferencia se calcula igual que la pantalla aunque no venga explícita', () => {
  const cierre = armarCierreCaja({ cash: { status: 'CLOSED', openingPyg: 100, expectedPyg: 300, countedPyg: 280 } })
  assert.equal(cierre.diferencia, -20)
  assert.ok(ticketCierreCaja(cierre, { ancho: 58 }).lineas().join('').includes('Gs -20'))
})

test('el cierre imprime el arqueo por denominación, el QR de verificación y la leyenda', () => {
  const cierre = armarCierreCaja({
    cash: {
      status: 'CLOSED',
      openingPyg: 500000,
      expectedPyg: 800000,
      countedPyg: 780000,
      countedBreakdown: { 100000: 5, 50000: 5, 10000: 3 },
      publicToken: 'tok-caja-1',
    },
    empresa: 'MobOS',
    sucursal: 'Central',
    usuario: 'Dario',
  })
  const texto = ticketCierreCaja(cierre, { ancho: 80 }).lineas().join('')
  assert.ok(texto.includes('Arqueo por denominación'))
  assert.ok(texto.includes('Gs 100.000 x 5'), 'billete de 100 mil con cantidad')
  assert.ok(texto.includes('Gs 500.000'), 'subtotal del arqueo')
  assert.ok(texto.includes('Gs 10.000 x 3'), 'moneda con cantidad')
  assert.ok(texto.includes('Total del arqueo'))
  assert.ok(texto.includes('[QR] MOBOS:CAJA:tok-caja-1'), 'QR de verificación sin base')
  assert.ok(texto.includes('Documento no fiscal. No válido como factura.'))
})

test('sin desglose el cierre avisa que el total se cargó a mano', () => {
  const cierre = armarCierreCaja({
    cash: { status: 'CLOSED', openingPyg: 100, expectedPyg: 300, countedPyg: 280 },
  })
  const texto = ticketCierreCaja(cierre, { ancho: 80 }).lineas().join('')
  assert.ok(texto.includes('Sin desglose por denominación'))
  assert.ok(!texto.includes('[QR]'))
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
})
