import assert from 'node:assert/strict'

// Verifica la trazabilidad del pedido recién pagado: quién registró el pago en
// el historial, los comprobantes asociados en el detalle y el estado nuevo
// READY_TO_SHIP aceptado por la API.
const [base, token, orderId, paymentId] = process.argv.slice(2)
const headers = { Authorization: `Bearer ${token}` }

const historyResponse = await fetch(`${base}/api/orders/${orderId}/history`, { headers })
assert.equal(historyResponse.status, 200)
const history = await historyResponse.json()
const paymentEvent = (history.events || []).find(event => event.type === 'payment' && event.id === paymentId)
assert.ok(paymentEvent, 'El historial debe incluir el evento del pago nuevo.')
assert.equal(paymentEvent.user?.name, 'Seller A', 'El evento de pago debe llevar el usuario que lo registró.')

const orderResponse = await fetch(`${base}/api/orders/${orderId}`, { headers })
assert.equal(orderResponse.status, 200)
const order = await orderResponse.json()
const payment = (order.payments || []).find(row => row.id === paymentId)
assert.ok(payment, 'El detalle del pedido debe incluir el pago.')
assert.ok(Array.isArray(payment.proofs), 'Los comprobantes del pago deben viajar como array.')
assert.equal(payment.proofs.length, 1, 'El pago debe listar su comprobante cargado.')
assert.equal(payment.proofs[0].fileName, 'synthetic-proof.pdf')
assert.equal(payment.proofs[0].data, undefined, 'Los metadatos del comprobante no deben incluir los bytes.')

const patched = await fetch(`${base}/api/orders/${orderId}`, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fulfillmentStatus: 'READY_TO_SHIP' }),
})
assert.equal(patched.status, 200, 'PATCH a READY_TO_SHIP debe responder 200.')
assert.equal((await patched.json()).fulfillmentStatus, 'READY_TO_SHIP')

console.log('Trazabilidad: usuario del pago, comprobantes en el detalle y READY_TO_SHIP OK.')
