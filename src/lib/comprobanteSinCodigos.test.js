import assert from 'node:assert/strict'
import test from 'node:test'
import { ESTADO_ENTREGA_BADGE, etiquetaEntrega } from './estadosPedido.js'
import { ticketComprobante } from './printing/tickets.js'
import { desgloseVenta, garantiaDeItem, pagoEnMonedaOriginal, pagosParaPapel } from './printing/ventaPapel.js'

// #461 · comprobante: ningún código interno (PICKED_UP…) llega al papel; IMEI, garantía en días por línea,
// pagos en su moneda original y «Atendido por» el vendedor.

test('etiquetaEntrega: los estados de la pantalla se ven igual en el comprobante, nunca como enum', () => {
  assert.equal(etiquetaEntrega('PICKED_UP'), 'Retirado')
  assert.equal(etiquetaEntrega('DELIVERED'), 'Entregado')
  assert.equal(etiquetaEntrega('READY_FOR_PICKUP'), 'Listo para retirar')
  assert.equal(etiquetaEntrega('CANCELLED'), 'Cancelado')
  for (const estado of Object.keys(ESTADO_ENTREGA_BADGE)) {
    const etiqueta = etiquetaEntrega(estado)
    assert.ok(etiqueta && !/_/.test(etiqueta) && etiqueta !== estado, `${estado} → «${etiqueta}» no es un código`)
  }
})

test('etiquetaEntrega: tipos de entrega y códigos desconocidos salen legibles', () => {
  assert.equal(etiquetaEntrega('RETIRO'), 'Retiro en tienda')
  assert.equal(etiquetaEntrega('DELIVERY'), 'Delivery')
  assert.equal(etiquetaEntrega('Delivery'), 'Delivery')
  assert.equal(etiquetaEntrega('Retiro en tienda'), 'Retiro en tienda')
  assert.equal(etiquetaEntrega('OUT_FOR_REVIEW'), 'Out for review')
  assert.equal(etiquetaEntrega(''), '')
  assert.equal(etiquetaEntrega(null), '')
})

test('garantiaDeItem: días por línea; sin dato no inventa garantía', () => {
  assert.equal(garantiaDeItem({ warrantyDays: 365 }), 'Garantía de 365 días')
  assert.equal(garantiaDeItem({ warrantyDays: 1 }), 'Garantía de 1 día')
  assert.equal(garantiaDeItem({}), '')
})

test('pagoEnMonedaOriginal: importe, cotización y solo para monedas extranjeras', () => {
  assert.equal(pagoEnMonedaOriginal({ currency: 'USD', originalAmount: '100.00', exchangeRatePyg: '7350.000000' }), 'USD 100 × Gs 7.350')
  assert.equal(pagoEnMonedaOriginal({ currency: 'USD', originalAmount: 13.6, exchangeRatePyg: 7350 }), 'USD 13,60 × Gs 7.350')
  assert.equal(pagoEnMonedaOriginal({ accountSnapshot: { currency: 'BRL' }, originalAmount: 50, exchangeRatePyg: 1500 }), 'BRL 50 × Gs 1.500')
  assert.equal(pagoEnMonedaOriginal({ currency: 'PYG', originalAmount: '100000', exchangeRatePyg: '1' }), '')
  assert.equal(pagoEnMonedaOriginal({ method: 'CASH', amountPyg: 100 }), '')
})

test('pagosParaPapel saca la reversión y el original revertido; el pie sigue sumando con signo', () => {
  const order = {
    totalPyg: 100,
    payments: [
      { id: 'a', status: 'CONFIRMED', amountPyg: 100 },
      { id: 'r', status: 'CONFIRMED', amountPyg: -100, reversalOfId: 'a' },
      { id: 'n', status: 'CONFIRMED', amountPyg: 100 },
      { id: 'p', status: 'PENDING', amountPyg: 50 },
    ],
  }
  assert.deepEqual(pagosParaPapel(order).map((pago) => pago.id), ['n'])
  assert.equal(desgloseVenta(order).pagado, 100)
  assert.equal(desgloseVenta(order).saldo, 0)
})

const PEDIDO = {
  orderNumber: 'AUR-#0003',
  createdAt: new Date('2026-09-19T12:00:00Z').toISOString(),
  tenant: { name: 'Tienda Demo S.A.', ruc: '80012345-6' },
  branch: { name: 'Sucursal Central' },
  seller: { name: 'Ana' },
  customer: { name: 'Juan Pérez' },
  fulfillmentStatus: 'PICKED_UP',
  deliveryType: 'RETIRO',
  items: [{ description: 'iPhone 13 128GB', quantity: 1, unitPricePyg: 3500000, totalPyg: 3500000, serials: ['356938035643809'], warrantyDays: 365 }],
  subtotalPyg: 3500000,
  totalPyg: 3500000,
  payments: [
    { status: 'CONFIRMED', method: 'CASH', amountPyg: 1470000, currency: 'USD', originalAmount: '200', exchangeRatePyg: '7350' },
    { status: 'CONFIRMED', method: 'TRANSFER', amountPyg: 2030000 },
  ],
}

test('el comprobante térmico dice «Retirado», trae IMEI, garantía en días, pago en dólares y «Atendido por»', () => {
  for (const ancho of [58, 80]) {
    const texto = ticketComprobante(PEDIDO, { nivel: 'completo', ancho, link: 'https://app.moboss.online/p/abc' }).lineas().join('')
    assert.ok(texto.includes('Retirado'), `estado humano en ${ancho}`)
    assert.ok(!texto.includes('PICKED_UP') && !texto.includes('RETIRO'), `ningún código interno en ${ancho}`)
    assert.ok(texto.includes('IMEI/Serie 356938035643809'), `IMEI por línea en ${ancho}`)
    assert.ok(texto.includes('Garantía de 365 días'), `garantía en días por línea en ${ancho}`)
    assert.ok(texto.includes('USD 200 × Gs 7.350'), `pago en su moneda original en ${ancho}`)
    assert.ok(texto.includes('Atendido por Ana') && !texto.includes('Registrado por Sistema'), `vendedor en ${ancho}`)
    assert.ok(texto.includes('AUR-0003') && !texto.includes('AUR-#0003'), `número con el formato único en ${ancho}`)
  }
})

test('una corrección de pago no se imprime como tres cobros', () => {
  const pedido = {
    ...PEDIDO,
    totalPyg: 100000,
    items: [{ description: 'Funda', quantity: 1, unitPricePyg: 100000, totalPyg: 100000 }],
    payments: [
      { id: 'a', status: 'CONFIRMED', method: 'CASH', amountPyg: 100000 },
      { id: 'r', status: 'CONFIRMED', method: 'CASH', amountPyg: -100000, reversalOfId: 'a' },
      { id: 'n', status: 'CONFIRMED', method: 'TRANSFER', amountPyg: 100000 },
    ],
  }
  const texto = ticketComprobante(pedido, { nivel: 'completo', ancho: 80, link: 'https://app.moboss.online/p/abc' }).lineas().join('')
  assert.ok(texto.includes('Transferencia'))
  assert.ok(!texto.includes('Efectivo'), 'el efectivo revertido no figura')
  assert.ok(!texto.includes('SALDO PENDIENTE'))
})
