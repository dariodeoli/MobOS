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
assert.equal((await cambiar(parcial.id, 'SHIPPED')).status, 200)
assert.equal((await cambiar(parcial.id, 'IN_TRANSIT')).status, 200)
assert.equal((await cambiar(parcial.id, 'PARTIAL')).status, 200)
assert.equal((await cambiar(parcial.id, 'IN_TRANSIT')).status, 200, 'Una entrega parcial se puede reintentar.')
const noEntregado = await crearPedido(`IT-NOENT-${stamp}`, 'Encomienda')
assert.equal((await cambiar(noEntregado.id, 'SHIPPED')).status, 200)
assert.equal((await cambiar(noEntregado.id, 'IN_TRANSIT')).status, 200)
assert.equal((await cambiar(noEntregado.id, 'NOT_DELIVERED')).status, 200)
assert.ok((await call(`/api/delivery/orders?estado=activos`, { headers: adminHeaders })).body
  .some((row) => row.id === noEntregado.id), 'No entregado sigue activo para reintentar.')

// ── Máquinas separadas por método (#191) ────────────────────────────────────
// Retiro: nunca "listo para enviar"; el reparto nunca "listo para retirar".
const noEnviado = await cambiar(retiro.id, 'READY_TO_SHIP')
assert.equal(noEnviado.status, 409, `Un retiro no pasa por listo para enviar: ${JSON.stringify(noEnviado.body)}`)
const envioNoRetira = await cambiar(envio.id, 'READY_FOR_PICKUP')
assert.equal(envioNoRetira.status, 409, `Un reparto no pasa por listo para retirar: ${JSON.stringify(envioNoRetira.body)}`)

// El tracking público lleva método, encabezado y línea de progreso del método.
const publicoEnvio = await call(`/api/orders/public/${envio.publicToken}`, { headers: {} })
assert.equal(publicoEnvio.status, 200, JSON.stringify(publicoEnvio.body))
const trackingEnvio = publicoEnvio.body.tracking || {}
assert.equal(trackingEnvio.metodo, 'DELIVERY')
assert.equal(trackingEnvio.encabezado, 'Seguimiento de envío')
assert.equal(trackingEnvio.estadoLabel, 'Entregado')
const pasosEnvio = (trackingEnvio.pasos || []).map((paso) => paso.label).join(' | ')
assert.ok(pasosEnvio.includes('En camino al cliente'), `El delivery habla del cliente: ${pasosEnvio}`)
assert.ok(!pasosEnvio.includes('Listo para retirar'), 'El delivery no muestra "listo para retirar".')
assert.ok((trackingEnvio.pasos || []).every((paso) => paso.hecho), 'El pedido entregado tiene todos los pasos cumplidos.')
assert.ok((trackingEnvio.pasos || []).some((paso) => paso.at), 'La línea de progreso trae fecha por actualización.')

const publicoRetiro = await call(`/api/orders/public/${retiro.publicToken}`, { headers: {} })
const trackingRetiro = publicoRetiro.body.tracking || {}
assert.equal(trackingRetiro.encabezado, 'Seguimiento de retiro')
assert.equal(trackingRetiro.estadoLabel, 'Retirado')
const pasosRetiro = (trackingRetiro.pasos || []).map((paso) => paso.label).join(' | ')
assert.ok(!pasosRetiro.includes('Listo para enviar'), 'El retiro no muestra "listo para enviar".')
assert.ok(!pasosRetiro.includes('En camino al cliente'), 'El retiro no habla de "cliente".')
assert.ok(pasosRetiro.includes('Listo para retirar'), `El retiro muestra su paso de retiro: ${pasosRetiro}`)

console.log('#152/#191: entrega separada del pago, máquinas por método y tracking público OK.')
