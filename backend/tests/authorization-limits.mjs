import assert from 'node:assert/strict'

// Autorizaciones operativas del issue #2 parte 1b: gasto por encima del límite
// de la empresa, transferencia entre sucursales de un rol sin permiso y compra
// a crédito por encima del umbral. Cada flujo: rechazo sin autorización,
// aprobación con máximo ajustado, ejecución de un solo uso y reintento 403.

const [baseUrl, adminToken, sellerToken, cajeraToken, gerenteToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !gerenteToken) throw new Error('Uso: authorization-limits.mjs <baseUrl> <adminToken> <sellerToken> <cajeraToken> <gerenteToken>')

async function request(path, method = 'GET', body, token = adminToken, tenant = 'tenant-a-it') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(tenant ? { 'x-tenant-id': tenant } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const movimientoGasto = (originalAmount, extra = {}) => ({ action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: String(originalAmount), exchangeRatePyg: 1, description: 'Insumos de mostrador', ...extra })

// ── Límites por empresa ─────────────────────────────────────────────────────
let result = await request('/api/account', 'POST', { password: 'company-password-it' }, adminToken, '')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/account', 'PATCH', { action: 'updateLimits', expenseLimitPyg: 100000, purchaseCreditLimitPyg: 200000 }, adminToken, '')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.expenseLimitPyg, 100000)
assert.equal(result.payload.purchaseCreditLimitPyg, 200000)
result = await request('/api/account', 'PATCH', { action: 'updateLimits', expenseLimitPyg: -1 }, adminToken, '')
assert.equal(result.response.status, 400, 'Un límite negativo debe rechazarse.')
result = await request('/api/account', 'PATCH', { action: 'updateLimits', expenseLimitPyg: 1.5 }, adminToken, '')
assert.equal(result.response.status, 400, 'Un límite con decimales debe rechazarse.')
result = await request('/api/account', 'GET', undefined, adminToken, '')
assert.equal(result.payload.tenant.expenseLimitPyg, 100000, 'GET /api/account debe devolver el límite de gasto.')

// ── Gasto sobre el límite ───────────────────────────────────────────────────
// Sin autorización el gasto por encima del límite se rechaza; por debajo no.
result = await request('/api/finance', 'POST', movimientoGasto(150000), cajeraToken)
assert.equal(result.response.status, 403, 'Un gasto sobre el límite sin autorización debe rechazarse.')
assert.match(String(result.payload?.message || ''), /autorizaci/i)
result = await request('/api/finance', 'POST', movimientoGasto(90000), cajeraToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

// La cajera pide autorización; la pendiente duplicada se bloquea.
result = await request('/api/authorizations', 'POST', { kind: 'EXPENSE_OVER_LIMIT', requestedValue: { amountPyg: 150000, description: 'Insumos de mostrador' } }, cajeraToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authGasto = result.payload
assert.equal(authGasto.status, 'PENDING')
assert.equal(authGasto.entity, 'EXPENSE')
assert.equal(authGasto.entityId, null)
assert.equal(authGasto.requestedById, 'user-cajera-it')
assert.deepEqual(authGasto.requestedValue, { amountPyg: 150000, description: 'Insumos de mostrador' })
result = await request('/api/authorizations', 'POST', { kind: 'EXPENSE_OVER_LIMIT', requestedValue: { amountPyg: 120000, description: 'Otro gasto' } }, cajeraToken)
assert.equal(result.response.status, 409, 'No puede haber dos solicitudes de gasto pendientes del mismo rol.')

// Gerencia autoriza MENOS de lo pedido y el gasto por encima del máximo falla.
result = await request('/api/authorizations', 'PATCH', { id: authGasto.id, action: 'approve', resolvedValue: { maxAmountPyg: 120000 }, resolvedNote: 'Máximo autorizado: 120.000.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.resolvedValue, { maxAmountPyg: 120000 })
result = await request('/api/finance', 'POST', movimientoGasto(130000, { expenseAuthorizationId: authGasto.id }), cajeraToken)
assert.equal(result.response.status, 403, 'La autorización de gasto no puede cubrir más que su máximo.')
assert.match(String(result.payload?.message || ''), /no alcanza/i)

// Dentro del máximo el gasto se registra, consume la autorización y audita.
result = await request('/api/finance', 'POST', movimientoGasto(120000, { expenseAuthorizationId: authGasto.id }), cajeraToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const gastoAutorizado = result.payload
assert.equal(gastoAutorizado.amountPyg, 120000)
result = await request('/api/authorizations?mine=1&kind=EXPENSE_OVER_LIMIT', 'GET', undefined, cajeraToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.find(row => row.id === authGasto.id)?.usedAt, 'La autorización de gasto debe quedar consumida.')
result = await request('/api/finance', 'POST', movimientoGasto(120000, { expenseAuthorizationId: authGasto.id }), cajeraToken)
assert.equal(result.response.status, 403, 'Una autorización de gasto usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// ── Transferencia entre sucursales ──────────────────────────────────────────
result = await request('/api/products', 'POST', { sku: `AUTH-TR-${Date.now()}`, name: 'Equipo transferencia autorizada', pricePyg: 300000, stock: 3, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoTransfer = result.payload
result = await request('/api/products', 'POST', { sku: `AUTH-TR-OTRO-${Date.now()}`, name: 'Equipo transferencia ajena', pricePyg: 300000, stock: 1, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoTransferOtro = result.payload
const transferBody = (productId, extra = {}) => ({ sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', lines: [{ productId, quantity: 1, serials: [] }], ...extra })

// El vendedor no transfiere sin autorización.
result = await request('/api/transfers', 'POST', transferBody(productoTransfer.id), sellerToken)
assert.equal(result.response.status, 403, 'Un vendedor no transfiere entre sucursales sin autorización.')

// Solicitud con sujeto (producto) y pendiente duplicada bloqueada.
result = await request('/api/authorizations', 'POST', { kind: 'TRANSFER', requestedValue: { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', productId: productoTransfer.id, quantity: 1 } }, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authTransfer = result.payload
assert.equal(authTransfer.entity, 'STOCK_TRANSFER')
assert.equal(authTransfer.entityId, productoTransfer.id)
result = await request('/api/authorizations', 'POST', { kind: 'TRANSFER', requestedValue: { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', productId: productoTransfer.id, quantity: 1 } }, sellerToken)
assert.equal(result.response.status, 409, 'No puede haber dos pendientes del mismo tipo y sujeto.')

// Gerencia aprueba; una operación sobre otro producto no puede usar esa autorización.
result = await request('/api/authorizations', 'PATCH', { id: authTransfer.id, action: 'approve', resolvedValue: { approved: true }, resolvedNote: 'Autorizado.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.resolvedValue, { approved: true })
result = await request('/api/transfers', 'POST', transferBody(productoTransferOtro.id, { transferAuthorizationId: authTransfer.id }), sellerToken)
assert.equal(result.response.status, 403, 'La autorización de transferencia debe corresponder al producto autorizado.')

// Con la aprobada el traslado se ejecuta, consume la autorización y el reintento falla.
result = await request('/api/transfers', 'POST', transferBody(productoTransfer.id, { transferAuthorizationId: authTransfer.id }), sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.sourceBranchId, 'branch-a-it')
assert.equal(result.payload.destinationBranchId, 'branch-a2-it')
result = await request('/api/authorizations?mine=1&kind=TRANSFER', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.find(row => row.id === authTransfer.id)?.usedAt, 'La autorización de transferencia debe quedar consumida.')
result = await request('/api/transfers', 'POST', transferBody(productoTransfer.id, { transferAuthorizationId: authTransfer.id }), sellerToken)
assert.equal(result.response.status, 403, 'Una autorización de transferencia usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// ── Compra a crédito sobre el umbral ────────────────────────────────────────
result = await request('/api/products', 'POST', { sku: `AUTH-PC-${Date.now()}`, name: 'Equipo compra a crédito', pricePyg: 400000, stock: 0, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoCompra = result.payload
const compraBody = (unitCostPyg, extra = {}) => ({ supplierName: 'Proveedor Autorización', branchId: 'branch-a-it', creditEnabled: true, lines: [{ productId: productoCompra.id, quantity: 1, unitCostPyg }], ...extra })

// Gerencia no crea la compra a crédito sobre el umbral sin autorización.
result = await request('/api/purchases', 'POST', compraBody(300000), gerenteToken)
assert.equal(result.response.status, 403, 'Una compra a crédito sobre el umbral sin autorización debe rechazarse.')

// Solicitud por el proveedor y pendiente duplicada bloqueada.
result = await request('/api/authorizations', 'POST', { kind: 'PURCHASE_CREDIT', requestedValue: { supplierName: 'Proveedor Autorización', totalPyg: 300000 } }, gerenteToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authCompra = result.payload
assert.equal(authCompra.entity, 'PURCHASE')
assert.equal(authCompra.entityId, null)
result = await request('/api/authorizations', 'POST', { kind: 'PURCHASE_CREDIT', requestedValue: { supplierName: 'Proveedor Autorización', totalPyg: 300000 } }, gerenteToken)
assert.equal(result.response.status, 409, 'No puede haber dos compras a crédito pendientes del mismo solicitante.')

// Gerencia autoriza MENOS del total pedido y la compra por encima falla.
result = await request('/api/authorizations', 'PATCH', { id: authCompra.id, action: 'approve', resolvedValue: { maxTotalPyg: 250000 }, resolvedNote: 'Máximo autorizado: 250.000.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.resolvedValue, { maxTotalPyg: 250000 })
result = await request('/api/purchases', 'POST', compraBody(300000, { purchaseAuthorizationId: authCompra.id }), gerenteToken)
assert.equal(result.response.status, 403, 'La autorización de compra no puede cubrir más que su máximo.')
assert.match(String(result.payload?.message || ''), /no alcanza/i)

// Dentro del máximo la compra se crea, consume la autorización y el reintento falla.
result = await request('/api/purchases', 'POST', compraBody(250000, { purchaseAuthorizationId: authCompra.id }), gerenteToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.creditEnabled, true)
result = await request('/api/authorizations?mine=1&kind=PURCHASE_CREDIT', 'GET', undefined, gerenteToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.find(row => row.id === authCompra.id)?.usedAt, 'La autorización de compra debe quedar consumida.')
result = await request('/api/purchases', 'POST', compraBody(250000, { purchaseAuthorizationId: authCompra.id }), gerenteToken)
assert.equal(result.response.status, 403, 'Una autorización de compra usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// El dueño (ADMIN) no necesita autorización para la compra a crédito.
result = await request('/api/purchases', 'POST', compraBody(300000, { supplierName: 'Proveedor Dueño' }), adminToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

console.log('authorization-limits: OK (límites por empresa, gasto sobre límite, transferencia entre sucursales y compra a crédito con solicitud/aprobación ajustada, consumo de un solo uso y reintento 403).')
