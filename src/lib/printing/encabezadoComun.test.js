// Encabezado y pie comunes (#407): todo imprimible ESC/POS arranca con la
// empresa + el tipo de documento y cierra con «Generado por MobOS para …»,
// igual que el comprobante premium. Solo presentación: no mira montos ni QR.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketEtiquetasLote, ticketEtiquetasUnidad, ticketListaCompra, ticketProforma, ticketPruebaTipo, ticketReciboInterno, ticketRemito, ticketReserva } from './tickets.js'

const empresa = { tenant: { name: 'Tienda Premium S.A.' } }

const casos = [
  ['cotización (proforma)', () => ticketProforma({ number: 'COT-1', createdAt: '2026-10-01T12:00:00Z', items: [{ description: 'Galaxy A55', quantity: 1, unitPricePyg: 2000000 }], totalPyg: 2000000, subtotalPyg: 2000000, tenant: empresa.tenant }), /FACTURA PROFORMA/i],
  ['recibo interno', () => ticketReciboInterno({ amountPyg: 1000, method: 'CASH' }, { orderNumber: 'MOB-1', tenant: empresa.tenant }), /RECIBO INTERNO/i],
  ['remito de traslado', () => ticketRemito({ lines: [], sourceBranch: { name: 'A' }, destinationBranch: { name: 'B' } }), /REMITO DE TRASLADO/i],
  ['reserva', () => ticketReserva({ reservedUntil: '2026-10-30T12:00:00Z', serial: '123456789012345', product: { name: 'iPhone' } }), /COMPROBANTE DE RESERVA/i],
  ['lista de compra', () => ticketListaCompra({ code: 'LC-1', items: [], emisor: empresa }), /LISTA DE COMPRA/i],
  ['prueba de impresión', () => ticketPruebaTipo('completa', { ancho: 80, nombre: 'ZKP8008' }), /PRUEBA DE IMPRESIÓN/i],
]

for (const [nombre, armar, tipo] of casos) {
  test(`${nombre}: encabezado con el tipo de documento y pie «Generado por MobOS»`, () => {
    const texto = armar().lineas().join('\n')
    assert.match(texto, tipo, 'tipo de documento en el encabezado')
    assert.ok(texto.indexOf('===') !== -1, 'regla del encabezado premium')
    assert.match(texto, /Generado por MobOS/, 'pie común')
  })
}

test('etiquetas de unidad y de lote cierran con el mismo pie', () => {
  for (const ticket of [ticketEtiquetasUnidad([{ imei: '356938035643809', model: 'iPhone 15' }], { ancho: 58 }), ticketEtiquetasLote([{ producto: 'iPhone 15', posicion: '1 de 2', imei: '356938035643809' }], { ancho: 58 })]) {
    const texto = ticket.lineas().join('\n')
    assert.ok(texto.length > 0)
    assert.match(texto, /MobOS|Generado por/, 'etiqueta con marca')
  }
})
