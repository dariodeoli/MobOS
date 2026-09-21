import assert from 'node:assert/strict'

// #152: la entrega va separada del pago y tiene estados propios por tipo
// (retiro: listo/retirado/parcial; reparto: enviado/en camino/entregado/no
// entregado), con transiciones validadas, rastro en la cronología y el listado
// de reparto siguiendo el estado nuevo (retirado = cerrado).
const [base, adminToken, sellerToken] = process.argv.slice(2)
const conJson = { 'Content-Type': 'application/json' }
const adminHeaders = { Authorization: `Bearer ${adminToken}`, ...conJson }
const sellerHeaders = { Authorization: `Bearer ${sellerToken}`, ...conJson }
const stamp = Date.now().toString(36)

async function call(path, { method = 'GET', body, headers = sellerHeaders } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, body: payload }
}

const producto = await call('/api/products', {
  method: 'POST',
  headers: adminHeaders,
  body: { sku: `IT-ENTREGA-${stamp}`, name: `Producto entrega ${stamp}`, pricePyg: 100000, stock: 5 },
})
assert.equal(producto.status, 201, `El producto del caso debe crearse: ${JSON.stringify(producto.body)}`)

const crearPedido = async (orderNumber, deliveryType) => {
  const pedido = await call('/api/orders', {
    method: 'POST',
    body: {
      orderNumber,
      deliveryType,
      items: [{ productId: producto.body.id, description: `Entrega ${stamp}`, quantity: 1, unitPricePyg: 100000 }],
      payment: { method: 'CASH', amountPyg: 100000 },
    },
  })
  assert.equal(pedido.status, 201, `El pedido ${orderNumber} debe crearse: ${JSON.stringify(pedido.body)}`)
  return pedido.body
}
const cambiar = (id, fulfillmentStatus, headers = sellerHeaders) =>
  call(`/api/orders/${id}`, { method: 'PATCH', headers, body: { fulfillmentStatus } })

// ── Retiro: pendiente → listo → retirado (y no se "envía") ────────────────
const retiro = await crearPedido(`IT-RETIRO-${stamp}`, 'Retiro en tienda')
const noAplica = await cambiar(retiro.id, 'SHIPPED')
assert.equal(noAplica.status, 409, `Un pedido de retiro no se envía: ${JSON.stringify(noAplica.body)}`)
assert.equal((await cambiar(retiro.id, 'READY_FOR_PICKUP')).status, 200)
assert.equal((await cambiar(retiro.id, 'PICKED_UP')).status, 200)
assert.equal((await cambiar(retiro.id, 'DELIVERED')).status, 409, 'Retirado es final.')

const historial = await call(`/api/orders/${retiro.id}/history`)
assert.equal(historial.status, 200)
const eventosEntrega = (historial.body.events || []).filter(
  (evento) => evento.type === 'audit' && evento.action === 'ORDER_FULFILLMENT_UPDATED',
)
assert.ok(eventosEntrega.length >= 2, 'La cronología guarda cada cambio de entrega.')

// El reparto trata lo retirado como cerrado.
const activos = await call('/api/delivery/orders?estado=activos', { headers: adminHeaders })
assert.equal(activos.status, 200, JSON.stringify(activos.body))
assert.ok(!(activos.body || []).some((row) => row.id === retiro.id), 'Retirado no está activo en reparto.')
const entregados = await call('/api/delivery/orders?estado=entregados', { headers: adminHeaders })
assert.ok((entregados.body || []).some((row) => row.id === retiro.id), 'Retirado cuenta como entregado.')

// ── Reparto: preparando → enviado → en camino → entregado (y no se "retira") ──
const envio = await crearPedido(`IT-ENVIO-${stamp}`, 'Delivery')
assert.equal((await cambiar(envio.id, 'SHIPPED')).status, 200)
assert.equal((await cambiar(envio.id, 'IN_TRANSIT')).status, 200)
assert.equal((await cambiar(envio.id, 'DELIVERED')).status, 200)
const retiradoAjeno = await cambiar(envio.id, 'PICKED_UP')
assert.equal(retiradoAjeno.status, 409, `Un reparto no se retira: ${JSON.stringify(retiradoAjeno.body)}`)

// ── Parcial y no entregado quedan disponibles para el reparto ──────────────
const parcial = await crearPedido(`IT-PARCIAL-${stamp}`, 'Delivery')
assert.equal((await cambiar(parcial.id, 'PARTIAL')).status, 200)
assert.equal((await cambiar(parcial.id, 'IN_TRANSIT')).status, 200, 'Una entrega parcial se puede reintentar.')
const noEntregado = await crearPedido(`IT-NOENT-${stamp}`, 'Encomienda')
assert.equal((await cambiar(noEntregado.id, 'NOT_DELIVERED')).status, 200)
assert.ok((await call(`/api/delivery/orders?estado=activos`, { headers: adminHeaders })).body
  .some((row) => row.id === noEntregado.id), 'No entregado sigue activo para reintentar.')

console.log('#152: entrega separada del pago por tipo, transiciones y reparto OK.')
