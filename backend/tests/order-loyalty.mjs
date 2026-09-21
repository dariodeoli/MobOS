import assert from 'node:assert/strict'

// #114: la venta acredita puntos de fidelización (movimiento ACCRUAL) cuando la
// empresa tiene porcentaje configurado, y no acredita nada con 0 (default).
// Corre contra el arnés HTTP aislado (cluster temporal propio).
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
  body: { sku: `IT-PUNTOS-${stamp}`, name: `Producto puntos ${stamp}`, pricePyg: 100000, stock: 5 },
})
assert.equal(producto.status, 201, 'El producto del caso debe crearse.')

// La cuenta exige reautenticar antes de una acción sensible (403 sin eso): el
// mismo paso que hace el arnés para cambiar la numeración.
const reauth = await call('/api/account', {
  method: 'POST',
  headers: adminHeaders,
  body: { password: 'company-password-it' },
})
assert.equal(reauth.status, 200, `La reautenticación de la cuenta debe pasar: ${JSON.stringify(reauth.body)}`)

// Porcentaje de la empresa: 10% de 200.000 = 20.000 puntos (1 punto = 1 Gs.).
const limites = await call('/api/account', {
  method: 'PATCH',
  headers: adminHeaders,
  body: { action: 'updateLimits', loyaltyPct: 10 },
})
assert.equal(limites.status, 200, `El porcentaje de fidelización debe configurarse: ${JSON.stringify(limites.body)}`)

const cliente = `Cliente fidelidad ${stamp}`
const pedido = await call('/api/orders', {
  method: 'POST',
  body: {
    orderNumber: `IT-PUNTOS-${stamp}`,
    customer: { name: cliente },
    items: [{ productId: producto.body.id, description: 'Venta con puntos', quantity: 2, unitPricePyg: 100000 }],
  },
})
assert.equal(pedido.status, 201, 'La venta con puntos debe guardarse.')
const customerId = pedido.body.customerId
assert.ok(customerId, 'La venta debe quedar asociada al cliente.')

const saldo = await call(`/api/customers/${customerId}/loyalty`)
assert.equal(saldo.status, 200)
assert.equal(saldo.body.loyaltyPct, 10, 'El porcentaje vigente viaja en el saldo.')
assert.equal(saldo.body.pointsPyg, 20000, 'La venta acredita el 10% del total (200.000).')
const accrual = (saldo.body.movements || []).find(movimiento => movimiento.kind === 'ACCRUAL' && movimiento.orderId === pedido.body.id)
assert.ok(accrual, 'El movimiento ACCRUAL debe quedar asociado al pedido.')
assert.equal(accrual.pointsPyg, 20000)
assert.match(String(accrual.note || ''), /IT-PUNTOS/, 'La nota del movimiento cita la venta.')

// Con la fidelización apagada la venta no acredita nada (y deja todo como estaba).
const apagado = await call('/api/account', {
  method: 'PATCH',
  headers: adminHeaders,
  body: { action: 'updateLimits', loyaltyPct: 0 },
})
assert.equal(apagado.status, 200, 'El porcentaje debe poder volver a 0.')
const pedidoSinPuntos = await call('/api/orders', {
  method: 'POST',
  body: {
    orderNumber: `IT-SIN-PUNTOS-${stamp}`,
    customer: { name: cliente },
    items: [{ productId: producto.body.id, description: 'Venta sin puntos', quantity: 1, unitPricePyg: 100000 }],
  },
})
assert.equal(pedidoSinPuntos.status, 201, `La venta sin fidelización debe guardarse: ${JSON.stringify(pedidoSinPuntos.body)}`)
const saldoFinal = await call(`/api/customers/${customerId}/loyalty`)
assert.equal(saldoFinal.body.pointsPyg, 20000, 'Sin porcentaje configurado no se acreditan puntos.')

console.log('#114: devengo de puntos por venta y corte con porcentaje 0 OK.')
