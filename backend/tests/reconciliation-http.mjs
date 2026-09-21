import assert from 'node:assert/strict'

// #144: conciliación por cuenta/procesadora, lote recibido vs esperado,
// diferencia con observación y trazabilidad pago → pedido.
const [base, admin, seller] = process.argv.slice(2)
if (!base || !admin || !seller) throw new Error('base admin seller requeridos')
let checks = 0
async function req(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const dia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10)
const sufijo = Date.now().toString(36).toUpperCase()

// Permisos: el vendedor no entra a conciliación.
await req('/api/finance/reconciliation', seller, 'GET', null, 403)

// Cuenta con procesadora y otra de transferencia para el caso "mismo lote, una sola cuenta".
const tarjeta = await req('/api/payment-accounts', admin, 'POST', { name: `Tarjeta ${sufijo}`, kind: 'CARD', currency: 'PYG', processor: 'Bancard' }, 201)
const transferencia = await req('/api/payment-accounts', admin, 'POST', { name: `Transferencia ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: `REC-${sufijo}` }, 201)
const producto = await req('/api/products', admin, 'POST', { name: `Producto conciliación ${sufijo}`, sku: `REC-${sufijo}`, pricePyg: 1000000, stock: 10 }, 201)

async function ordenConPago(accountId, amountPyg) {
  return req('/api/orders', seller, 'POST', {
    items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: amountPyg }],
    payments: [{ accountId, originalAmount: String(amountPyg), exchangeRatePyg: '1', amountPyg, method: accountId === tarjeta.id ? 'CARD' : 'TRANSFER', status: 'CONFIRMED', reference: `REF-${sufijo}-${amountPyg}` }],
  }, 201)
}

const ordenA = await ordenConPago(tarjeta.id, 1000000)
const pagoA = ordenA.payments[0]

// Detalle y agrupación por procesadora (foto del pago).
const hoy = dia()
const inicial = await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`, admin)
const itemA = inicial.items.find((item) => item.id === pagoA.id)
assert.ok(itemA, 'el pago recién creado aparece en la conciliación')
assert.equal(itemA.orderId, ordenA.id)
assert.equal(itemA.orderNumber, ordenA.orderNumber)
assert.equal(itemA.procesadora, 'Bancard')
assert.equal(itemA.conciliacion.state, 'PENDING')
const procesadora = inicial.porProcesadora.find((fila) => fila.key === 'Bancard')
assert.ok(procesadora && procesadora.unverifiedPyg >= 1000000, 'Bancard suma lo pendiente de conciliar')

// Lote exacto: recibido == esperado, sin diferencia ni observación.
const lote = await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoA.id], receivedPyg: 1000000 }, 201)
assert.equal(lote.conciliados, 1)
assert.equal(lote.lote.differencePyg, 0)
const verificado = await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`, admin)
const itemVerificado = verificado.items.find((item) => item.id === pagoA.id)
assert.equal(itemVerificado.conciliacion.state, 'VERIFIED')
assert.equal(itemVerificado.conciliacion.batchId, lote.lote.id)
assert.ok(verificado.lotes.some((fila) => fila.id === lote.lote.id && fila.pagos === 1))

// Diferencia sin observación: se rechaza antes de tocar nada (pago B nuevo).
const ordenB = await ordenConPago(transferencia.id, 1000000)
const pagoB = ordenB.payments[0]
await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoB.id], receivedPyg: 900000 }, 400)
// Diferencia con observación: se guarda y queda visible en el resumen.
const conDiferencia = await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoB.id], receivedPyg: 900000, note: 'Retención de comisión' }, 201)
assert.equal(conDiferencia.lote.differencePyg, -100000)
const conDiferenciaLeido = await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`, admin)
assert.ok(conDiferenciaLeido.lotes.some((fila) => fila.id === conDiferencia.lote.id && fila.estado === 'DIFFERENCE'))
assert.equal(conDiferenciaLeido.items.find((item) => item.id === pagoB.id).conciliacion.note, 'Retención de comisión')

// Un pago ya conciliado en un lote no se reasigna a otro (#204) y el lote
// original conserva su pago (no queda huérfano con diferencia).
await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoA.id], receivedPyg: 1000000 }, 409)
const consistente = await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`, admin)
assert.equal(consistente.lotes.find((fila) => fila.id === lote.lote.id)?.pagos, 1)
assert.equal(consistente.lotes.filter((fila) => fila.pagos === 0 && fila.differencePyg !== 0).length, 0)

// Un lote no puede mezclar cuentas ni repetir pagos.
await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoA.id, pagoB.id], receivedPyg: 2000000 }, 400)
await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [pagoB.id, pagoB.id], receivedPyg: 1000000 }, 400)
// Pago ajeno/inexistente.
await req('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: ['no-existe'], receivedPyg: 1 }, 404)

console.log(`Conciliación por cuenta/procesadora, lote y diferencia: ${checks} comprobaciones OK`)
