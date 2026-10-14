// Bloques comunes de todo papel (#426): CLIENTE completo, PEDIDO, GARANTÍA Y
// CONDICIONES y QR «Comprobante y seguimiento» en cada tipo de documento, sin
// costos, y el 58 mm oculto mientras el interruptor esté apagado.
import assert from 'node:assert/strict'
import test from 'node:test'
import { documentoCambio, documentoDevolucion, documentoRegalo, documentoTarjetaRegalo } from './operacionPapel.js'
import { cuerpoCambioHtml, cuerpoDevolucionHtml, cuerpoRegaloHtml, cuerpoTarjetaRegaloHtml } from './operacionHtml.js'
import { ticketCambio, ticketDevolucion, ticketRegalo, ticketTarjetaRegalo } from './ticketsOperacion.js'
import { ticketCertificado, ticketComprobanteRecepcion, ticketInformeDispositivo, ticketListaCompra, ticketManifiesto, ticketPruebaTipo } from './tickets.js'
import { crearPreferenciaFormato58, formatoPermitido, formatosVisibles } from './preferencias.js'
import { buildStationSheetHtml } from './hojaEstacion.js'
import { encabezadoTicket, MARGEN_SUPERIOR } from './encabezadoTicket.js'
import { crearTicket } from './escpos.js'

const ENLACE = 'https://clientes.moboss.online/pedidos/tok123'
const pedido = {
  orderNumber: 'MOB-1042',
  createdAt: '2026-10-14T12:00:00Z',
  fulfillmentStatus: 'READY_FOR_PICKUP',
  tenant: { name: 'Celulares Asunción', ruc: '80012345-6', address: 'Palma 123', city: 'Asunción', email: 'hola@ca.py' },
  branch: { name: 'Central', phone: '021 555 000' },
  seller: { name: 'Ana' },
  customer: { name: 'María Gómez', document: '4.123.456', phone: '0981 222 333', email: 'maria@correo.com' },
  items: [{ description: 'iPhone 13', quantity: 1, unitPricePyg: 4500000, totalPyg: 4500000, serials: ['356938035643809'], costPyg: 3900000, supplier: 'Proveedor Real SA' }],
  payments: [{ status: 'CONFIRMED', method: 'CARD', amountPyg: 4500000 }],
}
const nuevos = [{ description: 'Galaxy S24', quantity: 1, unitPricePyg: 5200000, totalPyg: 5200000 }]
const texto = (ticket) => ticket.lineas().join('\n')
const plano = (ticket) => texto(ticket).replace(/\s+/g, ' ')
const QR_FALSO = 'data:image/png;base64,AAAA'

test('devolución, cambio y regalo: CLIENTE/PEDIDO, condiciones y QR con el enlace del pedido (térmica)', () => {
  const doc = documentoDevolucion(pedido, { refundPyg: 4500000, motivo: 'Falla', enlace: ENLACE })
  const cambio = documentoCambio(pedido, { nuevos, medio: 'CASH', enlace: ENLACE })
  for (const ticket of [ticketDevolucion(doc), ticketCambio(cambio)]) {
    const t = texto(ticket)
    assert.match(t, /CLIENTE/)
    assert.match(t, /María Gómez/)
    assert.match(t, /Documento\s+4\.123\.456/)
    assert.match(t, /Teléfono\s+0981 222 333/)
    assert.match(t, /maria@correo\.com/)
    assert.match(t, /PEDIDO/)
    assert.match(t, /Listo para retirar/)
    assert.match(t, /GARANTÍA Y CONDICIONES/)
    assert.match(t, /Comprobante y seguimiento/)
    assert.match(t, /\[QR\]/)
    assert.match(plano(ticket), /Generado por MobOS para Celulares Asunción/)
    assert.ok(atob(ticket.base64()).includes(ENLACE), 'el QR lleva el enlace público')
    assert.ok(!/3900000|3\.900\.000|Proveedor Real/.test(t), 'sin costos ni proveedor')
  }
  const regalo = texto(ticketRegalo(documentoRegalo(pedido, { enlace: ENLACE })))
  assert.match(regalo, /GARANTÍA Y CONDICIONES/)
  assert.match(regalo, /\[QR\]/)
  assert.ok(!/María Gómez|Gs /.test(regalo), 'el regalo no lleva comprador ni importes')
})

test('devolución, cambio y regalo en HTML: bloques, política de cambios y QR', () => {
  const doc = documentoDevolucion(pedido, { refundPyg: 4500000, enlace: ENLACE })
  const html = cuerpoDevolucionHtml(doc, { termico: true, qrSrc: QR_FALSO })
  assert.match(html, /Cliente/)
  assert.match(html, /maria@correo\.com/)
  assert.match(html, /Pedido/)
  assert.match(html, /Garantía y condiciones/)
  assert.match(html, /Para cambiar o devolver/)
  assert.match(html, /<img class="qr"/)
  assert.match(html, /Comprobante y seguimiento: https:\/\/clientes\.moboss\.online\/pedidos\/tok123/)
  assert.ok(!html.includes('caja-total'))
  assert.match(cuerpoCambioHtml(documentoCambio(pedido, { nuevos, medio: 'CASH', enlace: ENLACE }), { qrSrc: QR_FALSO }), /<img class="qr"/)
  assert.match(cuerpoRegaloHtml(documentoRegalo(pedido, { enlace: ENLACE }), { qrSrc: QR_FALSO }), /<img class="qr"/)
  assert.ok(!cuerpoDevolucionHtml(documentoDevolucion(pedido, {}), {}).includes('class="qr"'), 'sin enlace público no hay QR')
})

test('tarjeta de regalo: condiciones y QR del código a canjear', () => {
  const doc = documentoTarjetaRegalo({ code: 'ABCD1234EFGH', amountPyg: 500000, createdAt: '2026-10-14T12:00:00Z' }, { empresa: pedido.tenant })
  const t = texto(ticketTarjetaRegalo(doc))
  assert.match(t, /GARANTÍA Y CONDICIONES/)
  assert.match(t, /\[QR\]/)
  assert.match(cuerpoTarjetaRegaloHtml(doc, { qrSrc: QR_FALSO }), /Garantía y condiciones[\s\S]*<img class="qr"/)
})

test('recepción, lista, manifiesto, certificado e informe llevan condiciones y su QR', () => {
  const base = { emisor: 'Celulares Asunción', enlace: 'https://app.moboss.online/x/1', enlacePublico: true, code: 'C-1', envio: 'E-1', lineas: [], resumen: {}, estado: {}, items: [], noOk: [], inspeccion: {}, verificacion: null }
  for (const ticket of [ticketComprobanteRecepcion(base), ticketListaCompra(base), ticketManifiesto(base), ticketCertificado(base), ticketInformeDispositivo(base)]) {
    const t = texto(ticket)
    assert.match(t, /GARANTÍA Y CONDICIONES/)
    assert.match(t, /\[QR\]/)
    assert.match(t, /Generado por MobOS/)
  }
  assert.match(texto(ticketCertificado(base)), /Comprobante y seguimiento/)
  assert.match(texto(ticketInformeDispositivo(base)), /Comprobante y seguimiento/)
})

test('hoja de estación: logo, empresa y condiciones', () => {
  const html = buildStationSheetHtml([], { estacion: 'Taller', logo: QR_FALSO })
  assert.match(html, /<img class="logo"/)
  assert.match(html, /Garantía y condiciones/)
})

test('todo ticket abre con aire arriba y, si hay, el logo de la empresa', () => {
  const t = crearTicket({ ancho: 80 }).iniciar()
  encabezadoTicket(t, 'PRUEBA', { empresa: { tenant: { name: 'Móvil Center S.A.' } }, logo: { ancho: 8, alto: 2, bytes: new Uint8Array(2) } })
  const lineas = t.lineas()
  assert.equal(lineas[0], '\n'.repeat(MARGEN_SUPERIOR), 'margen superior')
  assert.ok(lineas.some((linea) => linea.includes('[LOGO]')))
  assert.ok(lineas.findIndex((linea) => linea.includes('[LOGO]')) < lineas.findIndex((linea) => linea.includes('Móvil Center')))
})

test('el ticket de prueba lleva el encabezado de la empresa', () => {
  const t = texto(ticketPruebaTipo('corta', { ancho: 80 }))
  assert.match(t, /PRUEBA DE IMPRESIÓN/)
  assert.match(t, /VALIDACIÓN/)
})

test('58 mm: apagado por defecto y fuera de selectores y vistas previas', () => {
  const memoria = new Map()
  const storage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) }
  const pref = crearPreferenciaFormato58(storage)
  assert.equal(pref.activo(), false)
  const formatos = [['thermal-80', '80 mm'], ['a4', 'A4'], ['thermal-58', '58 mm']]
  assert.deepEqual(formatosVisibles(formatos, { activo: pref.activo() }).map(([id]) => id), ['thermal-80', 'a4'])
  assert.deepEqual(formatosVisibles([58, 80], { activo: false }), [80])
  assert.deepEqual(formatosVisibles([58, 80], { activo: false, actual: 58 }), [58, 80], 'una impresora de 58 conserva su ancho')
  assert.equal(formatoPermitido('thermal-58', { activo: false }), 'thermal-80')
  pref.fijar(true)
  assert.equal(pref.activo(), true)
  assert.equal(formatosVisibles(formatos, { activo: pref.activo() }).length, 3)
  assert.equal(formatoPermitido('thermal-58', { activo: true }), 'thermal-58')
})
