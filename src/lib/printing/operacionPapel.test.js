import assert from 'node:assert/strict'
import test from 'node:test'
import { documentoCambio, documentoDevolucion, documentoRegalo, documentoTarjetaRegalo, codigoEnmascarado } from './operacionPapel.js'
import { ticketCambio, ticketDevolucion, ticketRegalo, ticketTarjetaRegalo } from './ticketsOperacion.js'
import { cuerpoCambioHtml, cuerpoDevolucionHtml, cuerpoRegaloHtml, cuerpoTarjetaRegaloHtml } from './operacionHtml.js'
import { ticketComprobante } from './tickets.js'
import { desgloseVenta } from './ventaPapel.js'

const pedido = {
  orderNumber: 'MOB-1042',
  createdAt: '2026-10-14T12:00:00Z',
  tenant: { name: 'Celulares Asunción', ruc: '80012345-6', address: 'Palma 123', city: 'Asunción' },
  branch: { name: 'Central', phone: '021 555 000' },
  customer: { name: 'María Gómez' },
  totalPyg: 4850000,
  items: [
    { description: 'iPhone 13 128GB', quantity: 1, unitPricePyg: 4500000, totalPyg: 4500000, serials: ['356938035643809'], costPyg: 3900000, supplier: 'Proveedor Real SA' },
    { description: 'Funda transparente', quantity: 2, unitPricePyg: 175000, totalPyg: 350000 },
  ],
  payments: [{ status: 'CONFIRMED', method: 'CARD', amountPyg: 4850000 }],
}
const nuevos = [{ description: 'Samsung Galaxy S24 256GB', quantity: 1, unitPricePyg: 5200000, totalPyg: 5200000 }]
const texto = (ticket) => ticket.lineas().join('')
const sinLineasLargas = (ticket, columnas) => ticket.lineas().forEach((linea) => assert.ok(linea.replace(/\n$/, '').length <= columnas, `línea de ${linea.length} > ${columnas}: ${linea}`))

test('devolución: artículos en negativo, medio de reembolso y total en caja', () => {
  const doc = documentoDevolucion(pedido, { refundPyg: 4850000, motivo: 'Falla de pantalla' })
  assert.equal(doc.titulo, 'DEVOLUCIÓN')
  assert.deepEqual(doc.items.map((i) => i.totalPyg), [-4500000, -350000])
  assert.equal(doc.totalReembolsoPyg, -4850000)
  assert.equal(doc.metodos[0].label, 'Tarjeta / POS')
  const t = texto(ticketDevolucion(doc, { ancho: 80 }))
  assert.match(t, /DEVOLUCIÓN/)
  assert.match(t, /-Gs 4\.500\.000/)
  assert.match(t, /TOTAL REEMBOLSADO[\s\S]*-Gs 4\.850\.000/)
  assert.match(t, /Tarjeta \/ POS\s+-Gs 4\.850\.000/)
  const html = cuerpoDevolucionHtml(doc)
  assert.match(html, /caja-total/)
  assert.match(html, /Total reembolsado/)
  assert.match(html, /− Gs 4\.850\.000/)
})

test('devolución como saldo a favor etiqueta el medio y respeta reembolsos parciales y múltiples', () => {
  const credito = documentoDevolucion(pedido, { refundPyg: 350000, refundMode: 'CREDIT', items: [pedido.items[1]] })
  assert.equal(credito.metodos[0].label, 'Saldo a favor')
  assert.equal(credito.totalReembolsoPyg, -350000)
  const mixto = documentoDevolucion(pedido, { refundPyg: 4850000, reembolsos: [{ method: 'CASH', amountPyg: 850000 }, { method: 'TRANSFER', amountPyg: 4000000 }] })
  assert.deepEqual(mixto.metodos.map((m) => [m.label, m.amountPyg]), [['Efectivo', -850000], ['Transferencia', -4000000]])
})

test('cambio: devueltos negativos, nuevos, subtotales y A cobrar / A devolver', () => {
  const cobrar = documentoCambio(pedido, { devueltos: [pedido.items[0]], nuevos, medio: 'CASH' })
  assert.equal(cobrar.subtotalDevueltosPyg, -4500000)
  assert.equal(cobrar.subtotalNuevosPyg, 5200000)
  assert.equal(cobrar.direccion, 'cobrar')
  assert.equal(cobrar.totalCambioPyg, 700000)
  assert.equal(cobrar.medio, 'Efectivo')
  const t = texto(ticketCambio(cobrar, { ancho: 80 }))
  for (const parte of ['DEVUELTOS', 'NUEVOS', 'Subtotal devueltos', 'Subtotal nuevos', 'TOTAL DE CAMBIOS', 'A COBRAR', 'Gs 700.000', 'Medio de pago']) assert.ok(t.includes(parte), parte)
  assert.ok(t.includes('-Gs 4.500.000'))
  const devolver = documentoCambio(pedido, { devueltos: [pedido.items[0]], nuevos: [pedido.items[1]], modo: 'CREDIT' })
  assert.equal(devolver.direccion, 'devolver')
  assert.equal(devolver.rotuloTotal, 'A devolver')
  assert.equal(devolver.totalCambioPyg, 4150000)
  assert.equal(devolver.medio, 'Saldo a favor')
  assert.match(cuerpoCambioHtml(devolver), /A devolver[\s\S]*Gs 4\.150\.000/)
  assert.match(texto(ticketCambio(devolver, { ancho: 58 })), /Medio de reembolso/)
})

test('recibo de regalo: sin precios, cliente, pagos ni IMEI; con política de cambios', () => {
  const doc = documentoRegalo(pedido)
  const salidas = [
    texto(ticketRegalo(doc, { ancho: 80 })),
    texto(ticketRegalo(doc, { ancho: 58 })),
    cuerpoRegaloHtml(doc),
    JSON.stringify(doc),
  ]
  for (const salida of salidas) {
    assert.ok(!/Gs\s?\d|₲|4\.?500\.?000|175\.?000|4\.?850\.?000/.test(salida), 'no hay importes')
    assert.ok(!salida.includes('María') && !salida.includes('356938035643809') && !/Tarjeta \/ POS/.test(salida), 'sin cliente, IMEI ni pagos')
    assert.ok(!/3900000|Proveedor Real/.test(salida), 'sin costos ni proveedor')
  }
  const t = salidas[0]
  assert.match(t, /RECIBO DE REGALO/)
  assert.match(t, /Funda transparente\s+2/)
  assert.match(t, /Para cambiar o devolver/)
  assert.match(t, /MOB-1042/)
  const personalizada = documentoRegalo({ ...pedido, tenant: { ...pedido.tenant, exchangePolicy: 'Cambios hasta 15 días.' } })
  assert.equal(personalizada.politica, 'Cambios hasta 15 días.')
})

test('tarjeta de regalo: monto grande, código enmascarado, QR y vigencia', () => {
  const tarjeta = { code: 'GC-ABCD-EFGH-JK12', codeLast4: 'JK12', amountPyg: 500000, expiresAt: '2027-03-31T12:00:00', createdAt: '2026-10-14T12:00:00Z' }
  const doc = documentoTarjetaRegalo(tarjeta, { empresa: { nombre: 'Celulares Asunción' } })
  assert.equal(doc.codigoEnmascarado, '•••• •••• •••• JK12')
  assert.equal(codigoEnmascarado({ code: 'GC-ABCD-EFGH-5678' }), '•••• •••• •••• 5678')
  assert.match(doc.vigencia, /^Válida hasta el 31\/03\/2027$/)
  const t = texto(ticketTarjetaRegalo(doc, { ancho: 80 }))
  assert.ok(t.includes('[QR] GC-ABCD-EFGH-JK12'), 'QR del código')
  assert.ok(t.includes('**** **** **** JK12'))
  assert.ok(!t.includes('ABCD EFGH'), 'el código completo no sale en texto')
  assert.ok(t.includes('Gs 500.000') && t.includes('Válida hasta'))
  const html = cuerpoTarjetaRegaloHtml(doc, { qrSrc: 'data:image/png;base64,AAAA' })
  assert.match(html, /class="qr"/)
  assert.match(html, /•••• •••• •••• JK12/)
  assert.ok(!html.includes('ABCD-EFGH'), 'el HTML no imprime el código completo')
  const sinQr = documentoTarjetaRegalo({ codeLast4: '9999', amountPyg: 100000 })
  assert.ok(!texto(ticketTarjetaRegalo(sinQr, { ancho: 58 })).includes('[QR]'))
  assert.equal(sinQr.vigencia, 'Sin vencimiento')
})

test('58 mm: ninguna línea excede 32 columnas y los importes grandes no se recortan', () => {
  const grande = { ...pedido, items: [{ description: 'Notebook Gamer Ultra Pro Max 32GB RAM 2TB', quantity: 3, unitPricePyg: 12345678, totalPyg: 37037034 }] }
  const nuevosGrandes = [{ description: 'Monitor curvo 49 pulgadas ultrawide', quantity: 2, unitPricePyg: 9876543, totalPyg: 19753086 }]
  const tickets = [
    ticketDevolucion(documentoDevolucion(grande, { refundPyg: 37037034 }), { ancho: 58 }),
    ticketCambio(documentoCambio(grande, { nuevos: nuevosGrandes, medio: 'TRANSFER' }), { ancho: 58 }),
    ticketRegalo(documentoRegalo(grande), { ancho: 58 }),
    ticketTarjetaRegalo(documentoTarjetaRegalo({ code: 'GC-ABCD-EFGH-JK12', amountPyg: 99999999 }), { ancho: 58 }),
  ]
  tickets.forEach((ticket) => sinLineasLargas(ticket, 32))
  assert.ok(texto(tickets[0]).includes('-Gs 37.037.034'))
  assert.ok(texto(tickets[1]).includes('Gs 37.037.034') && texto(tickets[1]).includes('Gs 19.753.086'))
  assert.ok(texto(tickets[3]).includes('Gs 99.999.999'))
})

test('venta: total en caja y, con redondeo de efectivo, ajustado, recibido y vuelto', () => {
  const venta = { ...pedido, totalPyg: 1000000, items: [{ description: 'Cargador', quantity: 1, unitPricePyg: 1000000, totalPyg: 1000000 }], payments: [{ status: 'CONFIRMED', method: 'CASH', amountPyg: 999000 }], cashRoundingPyg: -1000, cashReceivedPyg: 1000000 }
  const d = desgloseVenta(venta)
  assert.equal(d.totalAjustado, 999000)
  assert.equal(d.vuelto, 1000)
  const t = texto(ticketComprobante(venta, { nivel: 'completo', ancho: 80 }))
  for (const parte of ['TOTAL DEL PEDIDO', 'Redondeo en efectivo', 'Total ajustado', 'Efectivo recibido', 'Vuelto']) assert.ok(t.includes(parte), parte)
  assert.match(t, /Vuelto\s+Gs 1\.000/)
  const sinRedondeo = texto(ticketComprobante({ ...pedido }, { nivel: 'completo', ancho: 58 }))
  assert.ok(sinRedondeo.includes('TOTAL DEL PEDIDO'))
  assert.ok(!sinRedondeo.includes('Redondeo') && !sinRedondeo.includes('Vuelto'))
  sinLineasLargas(ticketComprobante(venta, { nivel: 'completo', ancho: 58 }), 32)
})
