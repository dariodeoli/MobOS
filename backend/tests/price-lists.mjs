import assert from 'node:assert/strict'

// Ciclo completo de listas de precios y precios por cantidad contra la API
// real del arnés: crear lista, asignarla al cliente, vender y comprobar el
// precio aplicado (con su origen congelado) y la auditoría de los cambios.

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: price-lists.mjs <baseUrl> <adminToken> <sellerToken>')

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const suffix = `${Date.now()}`.slice(-6)
const sku = `PRICE-LIST-${suffix}`

// Producto con precio minorista y mayorista bien diferenciados.
let result = await request('/api/products', 'POST', { sku, name: `Producto precios ${suffix}`, category: `Categoria ${suffix}`, pricePyg: 100000, wholesalePricePyg: 80000, stock: 20, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const producto = result.payload
assert.equal(producto.pricePyg, 100000)

// Validaciones: ítem sin producto ni categoría, y porcentaje fuera de rango.
result = await request('/api/price-lists', 'POST', { name: `Lista inválida ${suffix}`, items: [{ adjustment: 'DISCOUNT', valuePct: 10 }] })
assert.equal(result.response.status, 400, 'Un ítem sin producto ni categoría debe rechazarse.')
result = await request('/api/price-lists', 'POST', { name: `Lista inválida ${suffix}`, items: [{ productId: producto.id, adjustment: 'DISCOUNT', valuePct: 150 }] })
assert.equal(result.response.status, 400, 'Un porcentaje fuera de 0–100 debe rechazarse.')

// Lista con ítem por producto (10% de descuento) y otro por categoría (5% recargo).
result = await request('/api/price-lists', 'POST', {
  name: `Lista Cliente ${suffix}`,
  currency: 'PYG',
  items: [
    { productId: producto.id, adjustment: 'DISCOUNT', valuePct: 10 },
    { category: `Categoria ${suffix}`, adjustment: 'SURCHARGE', valuePct: 5 },
  ],
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const lista = result.payload
assert.equal(lista.items.length, 2)
assert.equal(lista.isActive, true)

// Aislamiento multi-tenant: la lista no es visible desde otra empresa.
result = await request('/api/price-lists?all=1', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200)
const idsVisibles = (result.payload || []).map((row) => row.id)
assert.ok(idsVisibles.includes(lista.id), 'El vendedor de la empresa debe ver la lista activa.')

// Cliente con la lista asignada (override de mayorista/minorista).
result = await request('/api/customers', 'POST', { name: `Cliente lista ${suffix}`, phone: `0981${suffix}`, pricingTier: 'WHOLESALE' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cliente = result.payload
result = await request(`/api/customers/${cliente.id}`, 'PATCH', { priceListId: lista.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.priceListId, lista.id)

// La lista gana sobre el mayorista: 10% de descuento sobre el precio mayorista
// (80.000 → 72.000), no sobre el minorista.
result = await request('/api/orders', 'POST', {
  orderNumber: `IT-PL-1-${suffix}`,
  customerId: cliente.id,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 72000 }],
  payment: { method: 'CASH', amountPyg: 72000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
let pedido = result.payload
assert.equal(pedido.items[0].unitPricePyg, 72000)
assert.equal(pedido.items[0].listPricePyg, 72000, 'El precio de lista congelado debe ser el de la lista del cliente.')
assert.equal(pedido.items[0].priceSource, 'LIST')
assert.equal(pedido.items[0].priceListId, lista.id)

// Vender por debajo del precio de la lista exige autorización: el control usa
// el precio resuelto (72.000), no el minorista del producto.
result = await request('/api/orders', 'POST', {
  orderNumber: `IT-PL-2-${suffix}`,
  customerId: cliente.id,
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 60000 }],
  payment: { method: 'CASH', amountPyg: 60000 },
}, sellerToken)
assert.equal(result.response.status, 403, 'El vendedor no puede bajar del precio de la lista sin autorización.')

// Escalones por cantidad: desde 3 unidades el precio unitario es 70.000 y gana
// sobre la lista del cliente.
result = await request('/api/price-tiers', 'POST', { productId: producto.id, tiers: [{ minQuantity: 3, unitPricePyg: 70000 }, { minQuantity: 10, unitPricePyg: 65000 }] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.tiers.length, 2)
result = await request('/api/price-tiers', 'POST', { productId: producto.id, tiers: [{ minQuantity: 3, unitPricePyg: 70000 }, { minQuantity: 3, unitPricePyg: 65000 }] })
assert.equal(result.response.status, 400, 'Dos escalones con la misma cantidad mínima deben rechazarse.')
result = await request('/api/price-tiers', 'POST', { productId: producto.id, tiers: [{ minQuantity: 1, unitPricePyg: 70000 }] })
assert.equal(result.response.status, 400, 'Un escalón debe empezar en 2 unidades o más.')
result = await request(`/api/price-tiers?productId=${producto.id}`)
assert.equal(result.response.status, 200)
assert.equal(result.payload.length, 2)

result = await request('/api/orders', 'POST', {
  orderNumber: `IT-PL-3-${suffix}`,
  customerId: cliente.id,
  items: [{ productId: producto.id, description: producto.name, quantity: 3, unitPricePyg: 70000 }],
  payment: { method: 'CASH', amountPyg: 210000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.items[0].unitPricePyg, 70000)
assert.equal(result.payload.items[0].listPricePyg, 70000)
assert.equal(result.payload.items[0].priceSource, 'TIER', 'El escalón por cantidad gana sobre la lista del cliente.')

// Auditoría: creación y actualización de listas y escalones quedan registradas.
result = await request('/api/audit?action=PRICE_LIST_CREATED&limit=50')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok((result.payload || []).some((row) => row.entityId === lista.id), 'Falta la auditoría de creación de la lista.')
result = await request('/api/audit?action=PRICE_TIERS_UPDATED&limit=50')
assert.equal(result.response.status, 200)
assert.ok((result.payload || []).some((row) => row.entityId === producto.id), 'Falta la auditoría de los escalones.')

result = await request('/api/price-lists', 'PATCH', { id: lista.id, items: [{ productId: producto.id, adjustment: 'DISCOUNT', valuePct: 15 }] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.items.length, 1)
result = await request('/api/audit?action=PRICE_LIST_UPDATED&limit=50')
assert.equal(result.response.status, 200)
assert.ok((result.payload || []).some((row) => row.entityId === lista.id), 'Falta la auditoría de actualización de la lista.')

// Un vendedor no puede escribir listas ni escalones.
result = await request('/api/price-lists', 'POST', { name: `Lista vendedor ${suffix}` }, sellerToken)
assert.equal(result.response.status, 403, 'El vendedor no puede crear listas de precios.')
result = await request('/api/price-tiers', 'POST', { productId: producto.id, tiers: [] }, sellerToken)
assert.equal(result.response.status, 403, 'El vendedor no puede configurar escalones.')

// Desasignar la lista vuelve al precio mayorista del cliente.
result = await request(`/api/customers/${cliente.id}`, 'PATCH', { priceListId: null })
assert.equal(result.response.status, 200)
assert.equal(result.payload.priceListId, null)

console.log('price-lists: ciclo de listas, escalones, venta y auditoría OK')
