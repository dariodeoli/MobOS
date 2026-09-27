import assert from 'node:assert/strict'

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

// 1) Pedido ocasional: sin cliente en el alta.
const producto = await req('/api/products', 'POST', { sku: `OCAS-${sufijo}`, name: 'Producto ocasional', pricePyg: 120000, stock: 5, branchId: 'branch-a-it' }, 201)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `OCAS-${sufijo}`,
  items: [{ productId: producto.id, description: 'Producto ocasional', quantity: 1, unitPricePyg: 120000 }],
  payment: { method: 'CASH', amountPyg: 120000 },
}, 201)
assert.ok(pedido.id, 'el pedido ocasional se creó')
const ocasional = await req(`/api/orders/${encodeURIComponent(pedido.id)}`)
assert.equal(ocasional.customer, null, 'el pedido no tiene ficha vinculada')

// 2) Crear la ficha desde el pedido (un clic) y vincularla.
const creada = await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'createCustomer', customer: { name: `Ocasional ${sufijo}`, phone: `0987${String(Date.now()).slice(-6)}` } })
assert.ok(creada.customer?.id, 'la ficha se creó y se vinculó')
assert.equal(creada.customer.name, `Ocasional ${sufijo}`)
const conFicha = await req(`/api/orders/${encodeURIComponent(pedido.id)}`)
assert.equal(conFicha.customer?.id, creada.customer.id, 'el pedido quedó vinculado a la ficha')

// 3) La deduplicación reutiliza la ficha cuando coincide el teléfono.
const otra = await req('/api/orders', 'POST', {
  orderNumber: `OCAS2-${sufijo}`,
  items: [{ productId: producto.id, description: 'Producto ocasional', quantity: 1, unitPricePyg: 120000 }],
  payment: { method: 'CASH', amountPyg: 120000 },
}, 201)
const telefono = creada.customer?.phone || null
const vinculada = await req(`/api/orders/${encodeURIComponent(otra.id)}`, 'PATCH', { action: 'createCustomer', customer: { name: `Otro nombre ${sufijo}`, phone: telefono } })
assert.equal(vinculada.customer.id, creada.customer.id, 'con el mismo teléfono se reutiliza la ficha existente')

// 4) Cambiar el cliente y quitar el cliente, con auditoría y cronología.
const otraFicha = await req('/api/customers', 'POST', { name: `Cambio ${sufijo}`, phone: `0986${String(Date.now()).slice(-6)}` }, 201)
const cambiado = await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'setCustomer', customerId: otraFicha.id })
assert.equal(cambiado.customerId, otraFicha.id, 'el cliente se cambió')
await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'setCustomer', customerId: null })
const sinCliente = await req(`/api/orders/${encodeURIComponent(pedido.id)}`)
assert.equal(sinCliente.customer, null, 'el pedido volvió a ser ocasional')

const historia = await req(`/api/orders/${encodeURIComponent(pedido.id)}/history`)
const acciones = historia.events.map((evento) => evento.action).filter(Boolean)
assert.ok(acciones.includes('ORDER_CUSTOMER_CREATED'), 'la cronología registra la ficha creada')
assert.ok(acciones.includes('ORDER_CUSTOMER_CHANGED'), 'la cronología registra el cambio')
assert.ok(acciones.includes('ORDER_CUSTOMER_REMOVED'), 'la cronología registra el quitar')
const auditoria = await req('/api/audit?q=ORDER_CUSTOMER&limit=100')
assert.ok(auditoria.some((fila) => fila.action === 'ORDER_CUSTOMER_CHANGED' && fila.entityId === pedido.id), 'la auditoría guarda el cambio con su actor')

// 5) Validaciones.
await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'createCustomer', customer: { phone: '0981000000' } }, 400)
await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'setCustomer', customerId: 'no-existe' }, 400)
await req(`/api/orders/${encodeURIComponent(pedido.id)}`, 'PATCH', { action: 'setCustomer', customerId: null }, 401, 'token-invalido')

console.log(`PASS: cliente ocasional (sin ficha, crear/cambiar/quitar con auditoría y cronología) · ${checks} chequeos`)
