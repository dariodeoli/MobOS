import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { quoteActions } from './ventasF3.js'

const source = file =>
  readFileSync(new URL(`../components/ventas/${file}`, import.meta.url), 'utf8')

test('F3 quote row offers one primary progression with existing secondary actions', () => {
  const expected = {
    DRAFT: { send: true, accept: false, convert: false, link: false, cancel: true },
    SENT: { send: false, accept: true, convert: false, link: true, cancel: true },
    ACCEPTED: { send: false, accept: false, convert: true, link: false, cancel: true },
  }
  for (const [status, actions] of Object.entries(expected)) {
    const quote = Object.freeze({ status })
    assert.deepEqual(quoteActions(quote), actions)
    assert.equal([actions.send, actions.convert, actions.link].filter(Boolean).length, 1)
  }
})

test('F3 closed, expired or already ordered quotes never offer impossible progression', () => {
  for (const status of ['REJECTED', 'CONVERTED', 'EXPIRED', 'CANCELLED', 'UNKNOWN']) {
    assert.ok(Object.values(quoteActions({ status })).every(value => value === false))
  }
  for (const status of ['DRAFT', 'SENT', 'ACCEPTED']) {
    for (const attached of [
      { order: { id: 'isolated-order' } },
      { order: { orderNumber: 'TEST' } },
      { orderId: 'isolated-order' },
    ]) {
      assert.ok(
        Object.values(quoteActions({ status, ...attached })).every(value => value === false),
      )
    }
    assert.ok(Object.values(quoteActions({ status }, 'EXPIRED')).every(value => value === false))
  }
})

test('F3 retains list data/tenant scope, pagination, URL context and handlers', () => {
  const orders = source('SellerOrders.jsx')
  const quotes = source('SellerQuotes.jsx')
  for (const text of [
    "useUrlState('filtro', 'activos')",
    'new URLSearchParams({ filtro })',
    'row.sellerId === sesion.vendedorId',
    '{ limit: 50 }',
    'data.cargarMas',
    'location.search',
    'onChanged={data.refresh}',
    'customerOrderCount=',
    "orden.key === 'quantity'",
  ])
    assert.ok(orders.includes(text), text)
  assert.ok(!orders.includes('nombreCortoCliente'))
  for (const text of [
    'new URLSearchParams()',
    "params.set('status', filtro)",
    '{ limit: 50 }',
    'data.cargarMas',
    'cambiarEstado(row',
    'convertir(row)',
    'abrirEnlace(row)',
    'abrirCorreo(row)',
    'setHistorial(row)',
    'imprimirEnlace',
    'imprimirProforma',
    'enviarWhatsApp',
    '<CompartirPdf',
    '<PreviaCotizacion',
    'qParam',
  ])
    assert.ok(quotes.includes(text), text)
  assert.ok(quotes.includes('Pedido {codigoPedido(row.order.orderNumber)}'))
})

test('F3 order detail keeps real totals, guards and operational controls', () => {
  const detail = source('PedidoDetalle.jsx')
  for (const text of [
    "payments.filter(pago => pago.status === 'CONFIRMED')",
    'Math.max(0, total - paid)',
    '!esDemo && !anulado && pendiente > 0',
    'opcionesDeEntrega(',
    'cambiarEntrega(',
    'confirmarAnular',
    'confirmarEntregaConSaldo',
    '<PagosPedido',
    '<AutorizacionBloque',
    '<ComprobantePreview',
    '<ClienteDelPedidoModal',
    'enviarComentario',
    'alternarArchivado',
    'regenerarAccesoQr',
  ])
    assert.ok(detail.includes(text), text)
  const css = source('ventasF3.css')
  assert.ok(!css.includes('min-w-['))
  assert.ok(css.includes('white-space: nowrap'))
  assert.ok(css.includes('@media (max-width: 1199px)'))
})

test('F3 2C: filters are chips plus a sort menu, statuses use StatusChip, no native selects', () => {
  const orders = source('SellerOrders.jsx')
  const quotes = source('SellerQuotes.jsx')
  for (const file of [orders, quotes]) {
    assert.ok(file.includes('<ChipsFiltro'))
    assert.ok(file.includes('<Toolbar'))
    assert.doesNotMatch(file, /<Select\b/, 'sin select nativo')
  }
  assert.ok(orders.includes('FILTROS_MAS') && orders.includes('data-testid="pedidos-orden"'))
  assert.ok(quotes.includes('<StatusChip') && quotes.includes('FILTROS_MAS'))
  // The row "Más" trigger is a bordered 44px button, not bare text.
  assert.match(quotes, /trigger=\{\s*<span className="[^"]*min-h-11[^"]*min-w-11[^"]*border/)
  const lista = source('ListaVentasDia.jsx')
  assert.ok(lista.includes('<StatusChip'))
  assert.doesNotMatch(lista, /className=\{cn\(\s*'inline-flex items-center gap-1\.5 rounded-md border/, 'estado de cobro sin chip propio')
  assert.ok(!lista.includes('block truncate'), 'el vendedor no se corta con puntos suspensivos')
})
