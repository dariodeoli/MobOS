#!/usr/bin/env node

// Delivery propio de punta a punta sobre HTTP real: asignación por el local,
// pedidos acotados al repartidor, pre-cobro en la calle sin superar el saldo,
// entregado con y sin autorización de saldo, rendición y verificación en la
// tienda, y auditoría del ciclo completo.
//
// Uso: delivery.mjs <baseUrl> <adminToken> <sellerToken> <cajeraToken> <gerenteToken> <repartidorToken>

import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken, cajeraToken, generteToken, repartidorToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !generteToken || !repartidorToken) {
  throw new Error('Uso: delivery.mjs <baseUrl> <adminToken> <sellerToken> <cajeraToken> <gerenteToken> <repartidorToken>')
}

const REPARTIDOR_ID = 'user-repartidor-it'

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

async function crearPedido(orderNumber, extra = {}) {
  const { status, payload } = await call('/api/orders', {
    method: 'POST',
    token: sellerToken,
    body: {
      orderNumber,
      customer: { name: `Cliente ${orderNumber}`, phone: '981123456', countryCode: '+595', addresses: [{ label: 'Entrega', address: 'Av. Siempre Viva 742', city: 'Asunción', isDefault: true }] },
      deliveryType: 'Delivery',
      items: [{ productId: 'prod-a-order-it', description: 'Synthetic Product A Order', quantity: 1, unitPricePyg: 100000 }],
      ...extra,
    },
  })
  assert.equal(status, 201, `No se creó el pedido ${orderNumber}: ${JSON.stringify(payload)}`)
  return payload
}

async function asignar(orderId, body) {
  const { status, payload } = await call(`/api/orders/${orderId}/assignment`, { method: 'POST', token: sellerToken, body })
  assert.equal(status, 200, `No se pudo asignar el reparto: ${JSON.stringify(payload)}`)
  return payload
}

async function verReparto(orderId) {
  const { status, payload } = await call('/api/delivery/orders?estado=todos', { token: repartidorToken })
  assert.equal(status, 200, `El repartidor no pudo listar sus repartos: ${JSON.stringify(payload)}`)
  assert.ok(Array.isArray(payload), 'El listado de reparto debe ser un array.')
  return payload.find(row => row.id === orderId) || null
}

// ── 1. Permisos: el rol nuevo no entra por las puertas del panel de venta ──
{
  const { status: audit } = await call('/api/audit', { token: repartidorToken })
  assert.equal(audit, 403, 'El repartidor no debe poder leer la auditoría.')
  const { status: pago } = await call('/api/payments', { method: 'POST', token: repartidorToken, body: { orderId: 'x', method: 'CASH', amountPyg: 1000 } })
  assert.equal(pago, 403, 'El repartidor no debe poder registrar pagos confirmados desde /api/payments.')
  const { status: patch } = await call('/api/orders/inexistente', { method: 'PATCH', token: repartidorToken, body: { fulfillmentStatus: 'IN_TRANSIT' } })
  assert.equal(patch, 403, 'El repartidor no debe editar pedidos desde /api/orders.')
}

// ── 2. Asignación y alcance: solo ve lo suyo ──
const pedido = await crearPedido('IT-DELIVERY-001')
assert.equal(pedido.totalPyg, 100000)
assert.equal(await verReparto(pedido.id), null, 'Sin asignar, el pedido no debe aparecer en el reparto.')

const { payload: listadoVendedor } = await call('/api/orders', { token: sellerToken })
assert.ok(listadoVendedor.some(row => row.id === pedido.id), 'El vendedor debe ver el pedido que creó.')
{
  const { status, payload } = await call('/api/orders', { token: repartidorToken })
  assert.equal(status, 200)
  assert.ok(!payload.some(row => row.id === pedido.id), 'Antes de asignarlo, el repartidor no ve el pedido por el listado de venta.')
}

await asignar(pedido.id, { assignedToId: REPARTIDOR_ID })
{
  const fila = await verReparto(pedido.id)
  assert.ok(fila, 'El pedido asignado debe aparecer en el panel del repartidor.')
  assert.equal(fila.assignedTo.id, REPARTIDOR_ID)
  assert.equal(fila.delivery.pendingPyg, 100000)
  assert.equal(fila.customer.phone, '981123456', 'El repartidor debe ver el teléfono del cliente.')
  assert.equal(fila.customer.addresses[0].address, 'Av. Siempre Viva 742', 'El repartidor debe ver la dirección del cliente.')
}
{
  const { status, payload } = await call('/api/orders', { token: repartidorToken })
  assert.equal(status, 200)
  assert.ok(payload.every(row => row.assignedToId === REPARTIDOR_ID), 'El repartidor solo ve sus pedidos asignados.')
}
{
  const { status } = await call(`/api/orders/${pedido.id}`, { token: repartidorToken })
  assert.equal(status, 404, 'El detalle de venta no está disponible para el repartidor.')
}
{
  const { status } = await call(`/api/delivery/orders/${pedido.id}/collections`, {
    method: 'POST', token: sellerToken, body: { amountPyg: 1000, method: 'CASH' },
  })
  assert.equal(status, 403, 'El vendedor no cobra desde el panel de reparto (no tiene delivery:use).')
}

// ── 3. Pre-cobro: parcial, sin pasarse del saldo, y el saldo queda claro ──
{
  const { status, payload } = await call(`/api/delivery/orders/${pedido.id}/collections`, {
    method: 'POST', token: repartidorToken, body: { amountPyg: 40000, method: 'CASH' },
  })
  assert.equal(status, 201, `No se registró el pre-cobro: ${JSON.stringify(payload)}`)
  assert.equal(payload.status, 'PENDING', 'El pre-cobro nace PENDING: recién la rendición lo confirma.')
  assert.equal(payload.deliveryUserId, REPARTIDOR_ID)
}
{
  const { status, payload } = await call(`/api/delivery/orders/${pedido.id}/collections`, {
    method: 'POST', token: repartidorToken, body: { amountPyg: 60001, method: 'CASH' },
  })
  assert.equal(status, 409, `Cobrar por encima del saldo debe fallar: ${JSON.stringify(payload)}`)
}
{
  const fila = await verReparto(pedido.id)
  assert.equal(fila.delivery.collectedPyg, 40000)
  assert.equal(fila.delivery.confirmedPyg, 0)
  assert.equal(fila.delivery.pendingPyg, 60000, 'El pedido debe mostrar el pendiente actualizado.')
}
{
  const { status } = await call(`/api/delivery/orders/${pedido.id}/collections`, {
    method: 'POST', token: repartidorToken, body: { amountPyg: 60000, method: 'TRANSFER', reference: 'IT-TRANSFER-001' },
  })
  assert.equal(status, 201, 'El cobro del saldo restante por transferencia debe aceptarse.')
}
{
  const { status, payload } = await call(`/api/delivery/orders/${pedido.id}/collections`, {
    method: 'POST', token: repartidorToken, body: { amountPyg: 1, method: 'CASH' },
  })
  assert.equal(status, 409, `Un pedido ya cubierto no admite más cobros: ${JSON.stringify(payload)}`)
}

// ── 4. Entrega: en camino y entregado con el total pre-cobrado ──
{
  const { status } = await call(`/api/delivery/orders/${pedido.id}/status`, { method: 'POST', token: repartidorToken, body: { fulfillmentStatus: 'IN_TRANSIT' } })
  assert.equal(status, 200)
  const { status: entregado, payload } = await call(`/api/delivery/orders/${pedido.id}/status`, { method: 'POST', token: repartidorToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(entregado, 200, `No se pudo marcar entregado con el total cobrado: ${JSON.stringify(payload)}`)
  assert.equal(payload.fulfillmentStatus, 'DELIVERED')
}
{
  const fila = await verReparto(pedido.id)
  assert.equal(fila.delivery.pendingPyg, 0)
  assert.equal(fila.delivery.collectedPyg, 100000)
}

// ── 5. Rendición y verificación en la tienda ──
const rendicion = await (async () => {
  const { status, payload } = await call('/api/delivery/settlements', { method: 'POST', token: repartidorToken, body: { note: 'Vuelta de la mañana' } })
  assert.equal(status, 201, `No se pudo rendir: ${JSON.stringify(payload)}`)
  assert.equal(payload.totalPyg, 100000)
  assert.equal(payload.pendingPyg, 0)
  assert.equal(payload.payments.length, 2)
  assert.equal(payload.deliveryUser.id, REPARTIDOR_ID)
  return payload
})()
{
  const { status } = await call(`/api/delivery/settlements/${rendicion.id}/verify`, { method: 'POST', token: repartidorToken, body: { state: 'VERIFIED' } })
  assert.equal(status, 403, 'El repartidor no puede verificar su propia rendición.')
}
{
  const { status, payload } = await call(`/api/delivery/settlements/${rendicion.id}/verify`, { method: 'POST', token: cajeraToken, body: { state: 'VERIFIED', note: 'Efectivo y transferencia conformes' } })
  assert.equal(status, 200, `La caja no pudo verificar: ${JSON.stringify(payload)}`)
  assert.equal(payload.status, 'VERIFIED')
  assert.equal(payload.verifiedBy.id, 'user-cajera-it')
}
{
  const { status, payload } = await call(`/api/orders/${pedido.id}`, { token: sellerToken })
  assert.equal(status, 200)
  assert.equal(payload.status, 'COMPLETED', 'Verificada la rendición el pedido queda pagado y cerrado.')
  assert.ok(payload.payments.every(pago => pago.status === 'CONFIRMED'), 'Los cobros de la calle quedan CONFIRMED.')
  const cobrado = payload.payments.reduce((suma, pago) => suma + pago.amountPyg, 0)
  assert.equal(cobrado, 100000)
}
{
  const pagoId = rendicion.payments[0].id
  const { status, payload } = await call(`/api/payments/${pagoId}/reconciliation`, { token: cajeraToken })
  assert.equal(status, 200)
  assert.equal(payload.state, 'VERIFIED', 'La verificación deja la conciliación como el resto de los cobros.')
}
{
  const { status, payload } = await call(`/api/orders/${pedido.id}/history`, { token: sellerToken })
  assert.equal(status, 200)
  const acciones = (payload.events || []).map(evento => evento.action)
  assert.ok(acciones.includes('ORDER_ASSIGNED_TO_DELIVERY'), 'La asignación debe quedar en la cronología.')
  assert.ok(acciones.includes('DELIVERY_SETTLEMENT_VERIFIED'), 'La rendición verificada debe quedar en la cronología.')
  const eventoPago = (payload.events || []).find(evento => evento.type === 'payment')
  assert.ok(eventoPago, 'El pre-cobro debe aparecer en la cronología del pedido.')
}
{
  const { status, payload } = await call('/api/delivery/settlements', { method: 'POST', token: repartidorToken, body: {} })
  assert.equal(status, 409, `Sin cobros pendientes no hay rendición: ${JSON.stringify(payload)}`)
}
{
  const { status, payload } = await call(`/api/finance?branchId=${encodeURIComponent('branch-a-it')}`, { token: adminToken })
  assert.equal(status, 200, `Finanzas debe responder: ${JSON.stringify(payload)}`)
  const cuentasPorCobrar = payload.receivables?.rows || []
  assert.ok(Array.isArray(cuentasPorCobrar), 'Finanzas debe listar las cuentas por cobrar.')
  assert.ok(!cuentasPorCobrar.some(fila => fila.id === pedido.id), 'El pedido cobrado ya no es una cuenta por cobrar.')
  const idsRendidos = new Set(rendicion.payments.map(pago => pago.id))
  assert.ok(!(payload.reconciliations || []).some(fila => idsRendidos.has(fila.paymentId)), 'Un cobro de calle ya verificado no queda pendiente de conciliación.')
}

// ── 6. Entrega con saldo: la autorización de la tienda es obligatoria ──
const pedidoConSaldo = await crearPedido('IT-DELIVERY-002')
await asignar(pedidoConSaldo.id, { assignedToId: REPARTIDOR_ID })
{
  const { status, payload } = await call(`/api/delivery/orders/${pedidoConSaldo.id}/status`, { method: 'POST', token: repartidorToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(status, 403, `Entregar con saldo sin autorización debe rechazarse: ${JSON.stringify(payload)}`)
  assert.match(String(payload?.message || ''), /autorizaci/i, 'El error debe pedir autorización de entrega.')
}
await asignar(pedidoConSaldo.id, { assignedToId: REPARTIDOR_ID, allowUnpaidDelivery: true })
{
  const { status, payload } = await call(`/api/delivery/orders/${pedidoConSaldo.id}/status`, { method: 'POST', token: repartidorToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(status, 200, `Con autorización de gerencia la entrega con saldo procede: ${JSON.stringify(payload)}`)
}
{
  const { status, payload } = await call(`/api/delivery/settlements/${rendicion.id}/verify`, { method: 'POST', token: cajeraToken, body: { state: 'VERIFIED' } })
  assert.equal(status, 409, `Una rendición ya verificada no se vuelve a verificar: ${JSON.stringify(payload)}`)
}
{
  const fila = await verReparto(pedidoConSaldo.id)
  assert.equal(fila.delivery.pendingPyg, 100000, 'El saldo sigue pendiente: la entrega no inventa cobros.')
  assert.equal(fila.delivery.collectedPyg, 0)
}

// ── 7. Rechazo de la rendición: el cobro queda sin efecto y se repite ──
const pedidoRechazo = await crearPedido('IT-DELIVERY-003')
await asignar(pedidoRechazo.id, { assignedToId: REPARTIDOR_ID })
{
  const { status } = await call(`/api/delivery/orders/${pedidoRechazo.id}/collections`, { method: 'POST', token: repartidorToken, body: { amountPyg: 100000, method: 'CASH' } })
  assert.equal(status, 201)
}
const rendicionRechazada = await (async () => {
  const { status, payload } = await call('/api/delivery/settlements', { method: 'POST', token: repartidorToken, body: {} })
  assert.equal(status, 201)
  return payload
})()
{
  const { status, payload } = await call(`/api/delivery/settlements/${rendicionRechazada.id}/verify`, { method: 'POST', token: cajeraToken, body: { state: 'REJECTED', note: 'El efectivo no coincide' } })
  assert.equal(status, 200, `La caja debe poder rechazar: ${JSON.stringify(payload)}`)
  assert.equal(payload.status, 'REJECTED')
}
{
  const { status, payload } = await call(`/api/orders/${pedidoRechazo.id}`, { token: sellerToken })
  assert.equal(status, 200)
  const rechazados = payload.payments.filter(pago => pago.status === 'REJECTED')
  assert.equal(rechazados.length, 1, 'El cobro rechazado no queda confirmado.')
  assert.equal(payload.status, 'PENDING', 'El pedido sigue con saldo.')
}
{
  const { status } = await call(`/api/delivery/orders/${pedidoRechazo.id}/collections`, { method: 'POST', token: repartidorToken, body: { amountPyg: 100000, method: 'CASH' } })
  assert.equal(status, 201, 'El repartidor puede volver a registrar el cobro rechazado.')
  const { status: creada, payload } = await call('/api/delivery/settlements', { method: 'POST', token: repartidorToken, body: {} })
  assert.equal(creada, 201)
  const { status: verificada } = await call(`/api/delivery/settlements/${payload.id}/verify`, { method: 'POST', token: cajeraToken, body: { state: 'VERIFIED' } })
  assert.equal(verificada, 200)
}
{
  const { payload } = await call(`/api/orders/${pedidoRechazo.id}`, { token: sellerToken })
  assert.equal(payload.status, 'COMPLETED')
}

// ── 8. La gestión de repartos tampoco se saltea por el panel de reparto ──
{
  const { status, payload } = await call('/api/delivery/team', { token: generteToken })
  assert.equal(status, 200)
  assert.ok(payload.some(persona => persona.id === REPARTIDOR_ID), 'Gerencia ve al repartidor disponible para asignar.')
  assert.ok(!payload.some(persona => persona.id === 'user-a-it'), 'Un vendedor sin permiso de reparto no aparece como repartidor.')
}
{
  const { status } = await call('/api/delivery/team', { token: sellerToken })
  assert.equal(status, 200, 'El vendedor con delivery:manage puede listar repartidores.')
  const { status: denegado } = await call('/api/orders/inexistente/assignment', { method: 'POST', token: repartidorToken, body: { assignedToId: REPARTIDOR_ID } })
  assert.equal(denegado, 403, 'El repartidor no asigna repartos.')
}

console.log('delivery: ciclo completo OK (asignar → cobrar → rendir → verificar, con permisos, saldo y auditoría).')
