import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERIODOS_INFORME, rangoPeriodo, dentroDelRango, seccionesInforme, informeCsv, nombreArchivoInforme } from './customerReport.js'

const HOY = new Date(2026, 8, 21, 12, 0, 0) // 21-sep-2026

test('períodos del informe: Todo, Este año, Últimos 12 meses y Personalizado', () => {
  assert.deepEqual(PERIODOS_INFORME.map((item) => item.clave), ['todo', 'anio', '12m', 'custom'])
  assert.deepEqual(rangoPeriodo('todo', { hoy: HOY }), { desde: null, hasta: null })

  const anio = rangoPeriodo('anio', { hoy: HOY })
  assert.equal(anio.desde.getFullYear(), 2026)
  assert.equal(anio.desde.getMonth(), 0)
  assert.equal(anio.hasta.getFullYear(), 2026)
  assert.equal(anio.hasta.getMonth(), 11)

  const doceMeses = rangoPeriodo('12m', { hoy: HOY })
  assert.equal(doceMeses.hasta.getTime(), new Date(2026, 8, 21, 23, 59, 59, 999).getTime())
  assert.equal(doceMeses.desde.getTime(), new Date(2025, 8, 21, 0, 0, 0, 0).getTime())

  const custom = rangoPeriodo('custom', { desde: '2026-01-01', hasta: '2026-03-31', hoy: HOY })
  assert.equal(custom.desde.getDate(), 1)
  assert.equal(custom.hasta.getMonth(), 2)
})

test('dentroDelRango respeta los límites inclusive y las fechas inválidas', () => {
  const rango = rangoPeriodo('custom', { desde: '2026-01-01', hasta: '2026-01-31' })
  assert.equal(dentroDelRango('2026-01-01T10:00:00', rango), true)
  assert.equal(dentroDelRango('2026-01-31T23:00:00', rango), true)
  assert.equal(dentroDelRango('2025-12-31T23:59:00', rango), false)
  assert.equal(dentroDelRango('2026-02-01T00:00:00', rango), false)
  assert.equal(dentroDelRango('no-es-fecha', rango), false)
  assert.equal(dentroDelRango(null, rango), false)
})

test('seccionesInforme filtra por período y calcula totales, deudas y cronología', () => {
  const orders = [
    { orderNumber: 'MOB-0001', createdAt: '2026-02-10T10:00:00', status: 'COMPLETED', totalPyg: 100000, collectedPyg: 100000, pendingPyg: 0 },
    { orderNumber: 'MOB-0002', createdAt: '2026-02-20T10:00:00', status: 'PENDING', totalPyg: 200000, collectedPyg: 50000, pendingPyg: 150000 },
    { orderNumber: 'MOB-0003', createdAt: '2025-12-01T10:00:00', status: 'COMPLETED', totalPyg: 900000, collectedPyg: 900000, pendingPyg: 0 },
  ]
  const rango = rangoPeriodo('custom', { desde: '2026-02-01', hasta: '2026-02-28' })
  const secciones = seccionesInforme({
    customer: { name: 'Juana Pérez', pricingTier: 'WHOLESALE', creditLimitPyg: 500000, creditDays: 7, addresses: [{ label: 'Casa', address: 'Av. Siempre 123', city: 'Asunción' }] },
    orders,
    warranties: [{ serial: '123', description: 'Equipo', status: 'READY', createdAt: '2026-02-15T10:00:00', expiresAt: '2026-08-15T10:00:00' }],
    timeline: [
      { action: 'Pedido creado', detail: 'MOB-0002', createdAt: '2026-02-20T10:00:00', user: { name: 'Vera' } },
      { action: 'Cliente creado', detail: '', createdAt: '2025-10-01T10:00:00', user: null },
    ],
    analytics: { topProducts: [{ description: 'iPhone', quantity: 2, totalPyg: 200000 }] },
    billingIdentities: [{ name: 'Empresa SA', document: '80012345-6', uses: 3 }],
    rango,
  })
  const titulo = (nombre) => secciones.find((seccion) => seccion.titulo.includes(nombre))

  const resumen = titulo('Resumen').filas
  const valor = (clave) => resumen.find((fila) => fila[0] === clave)?.[1]
  assert.equal(valor('Pedidos'), 2)
  assert.equal(valor('Total gastado (Gs)'), 300000)
  assert.equal(valor('Pagado (Gs)'), 150000)
  assert.equal(valor('Saldo (Gs)'), 150000)
  assert.equal(valor('Ticket promedio (Gs)'), 150000)

  const pedidos = titulo('Pedidos').filas
  assert.equal(pedidos.length, 3) // encabezado + 2 del período
  const deudas = titulo('Deudas').filas
  assert.equal(deudas.length, 2) // MOB-0002 + encabezado (la vieja está paga)
  assert.equal(deudas[1][0], 'MOB-0002')

  const mensuales = titulo('Compras mensuales').filas
  assert.deepEqual(mensuales[1], ['2026-02', 2, 300000])

  const cronologia = titulo('Cronología').filas
  assert.equal(cronologia.length, 2)
  assert.equal(cronologia[1][2], 'Vera')

  const facturacion = titulo('facturación').filas
  assert.equal(facturacion[1][2], '3 pedidos')
})

test('informeCsv escapa comillas y separa secciones; el nombre de archivo va limpio', () => {
  const csv = informeCsv([{ titulo: 'Datos', filas: [['Nombre', 'Juana "la jefa"']] }])
  assert.match(csv, /"Datos"/)
  assert.match(csv, /"Juana ""la jefa"""/)
  assert.equal(nombreArchivoInforme('Juana Pérez', 'anio'), 'cliente-Juana-Perez-anio.csv')
  assert.equal(nombreArchivoInforme('', 'todo'), 'cliente-cliente-todo.csv')
})
