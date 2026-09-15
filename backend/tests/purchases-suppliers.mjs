import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: purchases-suppliers.mjs <baseUrl> <adminToken> [sellerToken]')

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
let result

// 1. Proveedor con la ficha completa de contacto.
result = await request('/api/suppliers', 'POST', { name: `Proveedor importador ${ts}`, document: `DOC-${ts}`, phone: '+595 981 555 123', address: 'Av. Monseñor Rodríguez 1234', city: 'Ciudad del Este', email: `compras-${ts}@proveedor.example`, contactName: 'Laura Giménez', paymentTerms: '7 días', notes: 'Proveedor directo de prueba' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const supplier = result.payload
assert.equal(supplier.phone, '+595 981 555 123')
assert.equal(supplier.address, 'Av. Monseñor Rodríguez 1234')
assert.equal(supplier.city, 'Ciudad del Este')
assert.equal(supplier.contactName, 'Laura Giménez')
assert.equal(supplier.paymentTerms, '7 días')

// 2. Editar teléfono y ciudad después de crear.
result = await request('/api/suppliers', 'PATCH', { id: supplier.id, phone: '061-555-432', city: 'Asunción' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.phone, '061-555-432')
assert.equal(result.payload.city, 'Asunción')
assert.equal(result.payload.contactName, 'Laura Giménez', 'El PATCH no debe borrar los campos no tocados.')
result = await request('/api/suppliers', 'PATCH', { id: supplier.id, phone: 'abc!!' })
assert.equal(result.response.status, 400, 'Teléfono con formato inválido debe rechazarse.')

// 3. Orden de compra contra el proveedor.
const productA = await request('/api/products', 'POST', { sku: `PS-A-${ts}`, name: `Equipo importado A ${ts}`, pricePyg: 200000, costPyg: 100000, stock: 0, branchId: 'branch-a-it' })
assert.equal(productA.response.status, 201, JSON.stringify(productA.payload))
const productB = await request('/api/products', 'POST', { sku: `PS-B-${ts}`, name: `Equipo importado B ${ts}`, pricePyg: 90000, costPyg: 50000, stock: 0, branchId: 'branch-a-it' })
assert.equal(productB.response.status, 201, JSON.stringify(productB.payload))

const account = await request('/api/payment-accounts', 'POST', { name: `Caja compras ${ts}`, currency: 'PYG', kind: 'CASH' })
assert.equal(account.response.status, 201, JSON.stringify(account.payload))
const accountId = account.payload.id

result = await request('/api/purchases', 'POST', { supplierId: supplier.id, supplierName: supplier.name, branchId: 'branch-a-it', lines: [{ productId: productA.payload.id, quantity: 2, unitCostPyg: 100000, lotReference: `LOTE-${ts}-A` }, { productId: productB.payload.id, quantity: 1, unitCostPyg: 50000, lotReference: `LOTE-${ts}-B` }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const purchase = result.payload
const lineA = purchase.lines.find(line => line.productId === productA.payload.id)
const lineB = purchase.lines.find(line => line.productId === productB.payload.id)
assert.ok(lineA && lineB, 'La compra debe devolver sus líneas.')
assert.equal(purchase.finalCostPyg, 250000, 'Costo final de la orden: 2×100000 + 1×50000.')
assert.equal(purchase.outstandingPyg, 250000)

// 4. Anticipo sobre la orden.
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'advance', accountId, currency: 'PYG', originalAmount: 40000, reference: `ANT-${ts}` })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.payment.kind, 'ADVANCE')
assert.equal(result.payload.payment.amountPyg, 40000)

// 5. Un anticipo que supera el saldo pendiente se rechaza.
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'advance', accountId, currency: 'PYG', originalAmount: 250000 })
assert.equal(result.response.status, 409, JSON.stringify(result.payload))

// 6. Balance del proveedor tras el anticipo.
result = await request(`/api/suppliers/${supplier.id}/balance`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
let balance = result.payload
assert.equal(balance.supplier.id, supplier.id)
assert.equal(balance.totalPurchasedPyg, 250000)
assert.equal(balance.paidPyg, 40000, 'El anticipo debe sumar como pagado.')
assert.equal(balance.outstandingPyg, 210000)
const orderRow = balance.orders.find(order => order.id === purchase.id)
assert.ok(orderRow, 'La orden debe aparecer en el desglose.')
assert.equal(orderRow.totalPyg, 250000)
assert.equal(orderRow.paidPyg, 40000)
assert.equal(orderRow.outstandingPyg, 210000)
if (sellerToken) {
  result = await request(`/api/suppliers/${supplier.id}/balance`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver el balance del proveedor.')
}

// 7. Edición de costos post-creación con recálculo y auditoría por línea.
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'update-costs', lines: [{ id: lineA.id, unitCostPyg: 60000, allocatedFeesPyg: 1000 }] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const updatedLineA = result.payload.lines.find(line => line.id === lineA.id)
assert.equal(updatedLineA.baseTotalPyg, 120000)
assert.equal(updatedLineA.allocatedExtraCostPyg, 1000)
assert.equal(updatedLineA.finalTotalCostPyg, 121000, '2×60000 + 1000 de gastos asignados.')
assert.equal(result.payload.finalCostPyg, 171000, '121000 (línea A) + 50000 (línea B).')
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'update-costs', lines: [{ id: 'linea-inexistente', unitCostPyg: 1, allocatedFeesPyg: 0 }] })
assert.equal(result.response.status, 409, 'Una línea ajena a la orden debe rechazarse.')

// 8. Balance tras la edición de costos.
result = await request(`/api/suppliers/${supplier.id}/balance`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
balance = result.payload
assert.equal(balance.totalPurchasedPyg, 171000, 'El balance debe reflejar el costo actualizado.')
assert.equal(balance.paidPyg, 40000)
assert.equal(balance.outstandingPyg, 131000)

// 9. Pago del saldo restante: el balance queda en cero.
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'pay', accountId, currency: 'PYG', originalAmount: 131000 })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.payment.kind, 'SETTLEMENT')
result = await request(`/api/suppliers/${supplier.id}/balance`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
balance = result.payload
assert.equal(balance.totalPurchasedPyg, 171000)
assert.equal(balance.paidPyg, 171000, 'Anticipo + pago deben sumarse completos.')
assert.equal(balance.outstandingPyg, 0)

// 10. La edición de costos queda auditada con antes/después por línea.
result = await request(`/api/purchases/${purchase.id}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const audit = result.payload.audit
assert.ok(audit.some(event => event.action === 'PURCHASE_ADVANCE'), 'Falta el evento PURCHASE_ADVANCE.')
const costEvents = audit.filter(event => event.action === 'PURCHASE_COSTS_UPDATED' && event.entityId === lineA.id)
assert.ok(costEvents.length >= 1, 'Falta la auditoría de la edición de costos.')
const costEvent = costEvents[0]
assert.equal(costEvent.metadata.purchaseOrderId, purchase.id)
assert.equal(costEvent.metadata.lineId, lineA.id)
assert.equal(costEvent.metadata.before.finalTotalCostPyg, 200000)
assert.equal(costEvent.metadata.before.unitCostPyg, 100000)
assert.equal(costEvent.metadata.after.unitCostPyg, 60000)
assert.equal(costEvent.metadata.after.finalTotalCostPyg, 121000)
if (sellerToken) {
  result = await request(`/api/purchases/${purchase.id}`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver el detalle de la compra.')
}

console.log('purchases-suppliers: checks OK (proveedor ampliado, anticipos con límite, balance y costos auditados).')
