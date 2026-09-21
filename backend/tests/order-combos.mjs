import assert from 'node:assert/strict'

// #102: la línea del pedido recuerda de qué combo salió. Se valida que el combo
// sea de la empresa y se congela el nombre para que el reporte no dependa del
// combo vivo. Corre contra el arnés HTTP aislado (cluster temporal propio).
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

// Productos propios del caso: no dependen del stock que dejaron otros pasos.
const productoA = await call('/api/products', {
  method: 'POST',
  headers: adminHeaders,
  body: { sku: `IT-COMBO-A-${stamp}`, name: `Combo A ${stamp}`, pricePyg: 100000, stock: 5 },
})
assert.equal(productoA.status, 201, 'El producto A del combo debe crearse.')
const productoB = await call('/api/products', {
  method: 'POST',
  headers: adminHeaders,
  body: { sku: `IT-COMBO-B-${stamp}`, name: `Combo B ${stamp}`, pricePyg: 50000, stock: 5 },
})
assert.equal(productoB.status, 201, 'El producto B del combo debe crearse.')

const combo = await call('/api/combos', {
  method: 'POST',
  headers: adminHeaders,
  body: {
    name: `Combo IT ${stamp}`,
    pricePyg: 120000,
    items: [
      { productId: productoA.body.id, quantity: 1 },
      { productId: productoB.body.id, quantity: 1 },
    ],
  },
})
assert.equal(combo.status, 201, 'El combo debe crearse.')

// La venta del combo la hace gerencia: el combo se ofrece con descuento sobre
// la lista y un vendedor necesitaría autorización por precio bajo lista (esa
// regla tiene su propia cobertura).
const pedido = await call('/api/orders', {
  method: 'POST',
  headers: adminHeaders,
  body: {
    orderNumber: `IT-COMBO-${stamp}`,
    items: [
      { productId: productoA.body.id, description: `Combo A ${stamp}`, quantity: 1, unitPricePyg: 80000, comboId: combo.body.id },
      { productId: productoB.body.id, description: `Combo B ${stamp}`, quantity: 1, unitPricePyg: 40000, comboName: 'Combo libre' },
    ],
  },
})
assert.equal(pedido.status, 201, `La venta con combo debe guardarse: ${JSON.stringify(pedido.body)}`)
const items = pedido.body.items || []
const conCombo = items.find(item => item.comboId)
assert.equal(conCombo?.comboId, combo.body.id, 'La línea debe recordar el combo.')
assert.equal(conCombo?.comboName, combo.body.name, 'El nombre del combo queda congelado.')
const libre = items.find(item => !item.comboId)
assert.equal(libre?.comboName, 'Combo libre', 'Sin comboId se respeta el nombre informado.')

// Un combo ajeno (o inexistente) no se acepta: mismo 404 de la validación.
const ajeno = await call('/api/orders', {
  method: 'POST',
  headers: adminHeaders,
  body: {
    orderNumber: `IT-COMBO-X-${stamp}`,
    items: [{ productId: productoA.body.id, description: 'Combo ajeno', quantity: 1, unitPricePyg: 100000, comboId: 'combo-de-otra-empresa' }],
  },
})
assert.equal(ajeno.status, 404, `Un combo que no es de la empresa debe rechazarse: ${JSON.stringify(ajeno.body)}`)

// El detalle del pedido conserva el combo después de creado.
const detalle = await call(`/api/orders/${pedido.body.id}`, { headers: adminHeaders })
assert.equal(detalle.status, 200, JSON.stringify(detalle.body))
assert.equal((detalle.body.items || []).find(item => item.comboId)?.comboId, combo.body.id, 'El detalle debe seguir mostrando el combo.')

console.log('#102: combo registrado en la línea del pedido (validación y congelado) OK.')
