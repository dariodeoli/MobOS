#!/usr/bin/env node

// Cobro del POS (#399) sobre HTTP real: «Paga al recibir» persistido y
// listado, datos de encomienda (empresa, sucursal, dirección del cliente) y
// cliente bloqueado (crédito 422, contado permitido y auditado, permisos).
//
// Uso: cobro-encomienda-bloqueo.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken>

import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken, gerenteToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !gerenteToken) throw new Error('Uso: cobro-encomienda-bloqueo.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken>')

const stamp = Date.now().toString(36)

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.99', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const linea = { productId: 'prod-a-order-it', description: 'Synthetic Product A Order', quantity: 1, unitPricePyg: 100000 }
const pedido = (orderNumber, extra = {}) => call('/api/orders', { method: 'POST', token: sellerToken, body: { orderNumber, items: [linea], ...extra } })

// Cliente con dos direcciones guardadas.
const alta = await call('/api/orders', {
  method: 'POST', token: sellerToken,
  body: { orderNumber: `IT-COBRO-BASE-${stamp}`, items: [linea], payment: { method: 'CASH', amountPyg: 100000 }, customer: { name: `Cliente Cobro ${stamp}`, phone: '981555000', countryCode: '+595', addresses: [{ label: 'Casa', address: 'Av. Mcal. López 123', city: 'Asunción', isDefault: true }, { label: 'Local', address: 'Ruta 2 km 30', city: 'Itauguá' }] } },
})
assert.equal(alta.status, 201, JSON.stringify(alta.payload))
const customerId = alta.payload.customerId
assert.ok(customerId)
const direcciones = alta.payload.customer.addresses
assert.equal(direcciones.length, 2)

// 1) «Paga al recibir»: persistido, listado e idempotente.
const key = `cobro-${stamp}-key-0001`
let r = await call('/api/orders', { method: 'POST', token: sellerToken, headers: { 'Idempotency-Key': key }, body: { orderNumber: `IT-POD-${stamp}`, items: [linea], customerId, paymentOnDelivery: true } })
assert.equal(r.status, 201, JSON.stringify(r.payload))
assert.equal(r.payload.paymentOnDelivery, true)
assert.equal(r.payload.status, 'PENDING')
assert.equal(r.payload.payments.length, 0)
const podId = r.payload.id
const repetido = await call('/api/orders', { method: 'POST', token: sellerToken, headers: { 'Idempotency-Key': key }, body: { orderNumber: `IT-POD-${stamp}`, items: [linea], customerId, paymentOnDelivery: true } })
assert.equal(repetido.payload.id, podId, 'la misma Idempotency-Key devuelve el mismo pedido')
r = await call('/api/orders?filtro=todos&limit=100', { token: sellerToken })
assert.equal(r.status, 200)
assert.equal(r.payload.find(o => o.id === podId)?.paymentOnDelivery, true, 'el listado expone la marca')
assert.equal(r.payload.find(o => o.orderNumber === `IT-COBRO-BASE-${stamp}`)?.paymentOnDelivery, false)
r = await pedido(`IT-POD-BAD-${stamp}`, { customerId, paymentOnDelivery: true, payments: [{ method: 'CASH', amountPyg: 1000 }] })
assert.equal(r.status, 400, 'paga al recibir no admite pagos cargados')
r = await pedido(`IT-POD-BAD2-${stamp}`, { customerId, paymentOnDelivery: 'si' })
assert.equal(r.status, 400)
// Se cobra después con el registro de pago existente y el total se respeta.
r = await call('/api/payments', { method: 'POST', token: sellerToken, headers: { 'Idempotency-Key': `cobro-${stamp}-pago-0001` }, body: { orderId: podId, method: 'CASH', amountPyg: 100000 } })
assert.ok([200, 201].includes(r.status), `cobro posterior: ${r.status} ${JSON.stringify(r.payload)}`)

// 2) Encomienda: empresa, sucursal y dirección guardada del cliente.
r = await pedido(`IT-ENC-${stamp}`, { customerId, deliveryType: 'Encomienda', deliveryPyg: 25000, shippingCarrier: 'Nuestra Señora de la Asunción', shippingBranch: 'Ciudad del Este', shippingAddressId: direcciones[1].id, payment: { method: 'CASH', amountPyg: 125000 } })
assert.equal(r.status, 201, JSON.stringify(r.payload))
assert.equal(r.payload.shippingCarrier, 'Nuestra Señora de la Asunción')
assert.equal(r.payload.shippingBranch, 'Ciudad del Este')
assert.equal(r.payload.shippingAddressId, direcciones[1].id)
assert.match(r.payload.shippingAddress, /Ruta 2 km 30/)
assert.equal(Number(r.payload.totalPyg), 125000, 'el envío suma al total')
const encId = r.payload.id
r = await call('/api/orders?filtro=todos&limit=100', { token: sellerToken })
assert.equal(r.payload.find(o => o.id === encId)?.shippingBranch, 'Ciudad del Este')
r = await pedido(`IT-ENC-BAD-${stamp}`, { customerId, deliveryType: 'Delivery', shippingCarrier: 'X' })
assert.equal(r.status, 400, 'empresa solo con encomienda')
const ajena = await call('/api/orders', { method: 'POST', token: sellerToken, body: { orderNumber: `IT-ENC-AJ-${stamp}`, items: [linea], payment: { method: 'CASH', amountPyg: 100000 }, customer: { name: `Otro ${stamp}`, phone: '981555111', countryCode: '+595', addresses: [{ address: 'Calle ajena 1' }] } } })
r = await pedido(`IT-ENC-BAD2-${stamp}`, { customerId, deliveryType: 'Encomienda', shippingAddressId: ajena.payload.customer.addresses[0].id })
assert.equal(r.status, 400, 'la dirección debe ser del cliente de la venta')

// 3) Cliente bloqueado: permisos, auditoría, crédito 422, contado permitido.
r = await call(`/api/customers/${customerId}`, { method: 'PATCH', token: sellerToken, body: { blocked: true, blockedReason: 'Deuda vencida' } })
assert.equal(r.status, 403, 'el vendedor no bloquea')
r = await call(`/api/customers/${customerId}`, { method: 'PATCH', token: adminToken, body: { blocked: true } })
assert.equal(r.status, 400, 'bloquear exige motivo')
r = await call(`/api/customers/${customerId}`, { method: 'PATCH', token: gerenteToken, body: { blocked: true, blockedReason: 'Deuda vencida' } })
assert.equal(r.status, 200, JSON.stringify(r.payload))
assert.equal(r.payload.blocked, true)
assert.equal(r.payload.blockedReason, 'Deuda vencida')
r = await call(`/api/customers/${customerId}`, { token: sellerToken })
assert.equal(r.payload.customer.blocked, true, 'la ficha expone el bloqueo al POS')
assert.equal(r.payload.customer.blockedReason, 'Deuda vencida')

await call(`/api/customers/${customerId}`, { method: 'PATCH', token: adminToken, body: { creditLimitPyg: 5000000, creditDays: 30 } })
r = await pedido(`IT-BLQ-CRED-${stamp}`, { customerId, creditDays: 30 })
assert.equal(r.status, 422, `crédito a bloqueado: ${JSON.stringify(r.payload)}`)
assert.match(r.payload.message || '', /bloqueado/i)
r = await pedido(`IT-BLQ-CASH-${stamp}`, { customerId, payment: { method: 'CASH', amountPyg: 100000 } })
assert.equal(r.status, 201, 'el contado se permite')
const blqId = r.payload.id
r = await call(`/api/audit?q=${encodeURIComponent(customerId)}`, { token: adminToken })
assert.equal(r.status, 200)
const acciones = r.payload.map(a => a.action)
assert.ok(acciones.includes('CUSTOMER_BLOCKED'), 'el bloqueo queda auditado')
assert.ok(acciones.includes('ORDER_BLOCKED_CUSTOMER_SALE') || (await call(`/api/audit?q=${blqId}`, { token: adminToken })).payload.some(a => a.action === 'ORDER_BLOCKED_CUSTOMER_SALE'), 'la venta de contado a bloqueado queda registrada')

// Desbloqueo: vuelve a poder vender a crédito y queda auditado.
r = await call(`/api/customers/${customerId}`, { method: 'PATCH', token: adminToken, body: { blocked: false } })
assert.equal(r.status, 200)
assert.equal(r.payload.blocked, false)
assert.equal(r.payload.blockedReason, null)
r = await pedido(`IT-BLQ-OK-${stamp}`, { customerId, creditDays: 30 })
assert.equal(r.status, 201, JSON.stringify(r.payload))
r = await call(`/api/audit?q=${encodeURIComponent(customerId)}`, { token: adminToken })
assert.ok(r.payload.some(a => a.action === 'CUSTOMER_UNBLOCKED'), 'el desbloqueo queda auditado')

console.log('cobro-encomienda-bloqueo: OK')
