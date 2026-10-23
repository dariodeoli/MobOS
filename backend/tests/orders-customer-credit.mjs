import assert from 'node:assert/strict'

// Saldo a favor aplicado (409 al cambiar o quitar el cliente). Va al final del arnés: su pago STORE_CREDIT
// queda en la base y las pruebas de auditoría de caja suman por su cuenta todos los pagos del día.
// #149 — Cliente ocasional: pedido sin cliente, asignar/cambiar/quitar la ficha
// con auditoría y cronología, y crear la ficha desde el pedido en un clic
// reutilizando la deduplicación del alta (documento > teléfono > nombre).
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const sufijo = Date.now().toString(36).toUpperCase()

const otraFicha = await req('/api/customers', 'POST', { name: `Cambio favor ${sufijo}`, phone: `0985${String(Date.now()).slice(-6)}` }, 201)
// 7) Saldo a favor aplicado: el cliente del pedido no se cambia ni se quita (409).
const clienteFavor = await req('/api/customers', 'POST', { name: `Favor ${sufijo}`, phone: `59597${String(Date.now()).slice(-7)}` }, 201)
await req('/api/store-credits', 'POST', { customerId: clienteFavor.id, amountPyg: 40000, note: 'Cortesía de prueba' }, 201)
const productoFavor = await req('/api/products', 'POST', { sku: `FAV-${sufijo}`, name: 'Producto con saldo a favor', pricePyg: 40000, stock: 5, branchId: 'branch-a-it' }, 201)
const pedidoFavor = await req('/api/orders', 'POST', { orderNumber: `FAV-${sufijo}`, customerId: clienteFavor.id, items: [{ productId: productoFavor.id, quantity: 1, unitPricePyg: 40000 }], payments: [{ method: 'STORE_CREDIT', amountPyg: 40000 }] }, 201)
await req(`/api/orders/${encodeURIComponent(pedidoFavor.id)}`, 'PATCH', { action: 'setCustomer', customerId: otraFicha.id }, 409)
await req(`/api/orders/${encodeURIComponent(pedidoFavor.id)}`, 'PATCH', { action: 'setCustomer', customerId: null }, 409)
const sigue = await req(`/api/orders/${encodeURIComponent(pedidoFavor.id)}`)
assert.equal(sigue.customer?.id, clienteFavor.id, 'el cliente sigue siendo el del saldo a favor')

console.log(`PASS: saldo a favor aplicado bloquea cambiar/quitar cliente · ${checks} chequeos`)
