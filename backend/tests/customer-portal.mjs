// Portal público del cliente por QR: enlaces por nivel (rápido | completo),
// saldo y vencimientos, pedidos, garantías, direcciones, regeneración que
// invalida el enlace anterior, token inválido y ausencia de datos internos.
// Uso: node backend/tests/customer-portal.mjs BASE_URL ADMIN_TOKEN SELLER_TOKEN [CAJERA_TOKEN] [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, sellerToken, cajeraToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: customer-portal.mjs <baseUrl> <adminToken> <sellerToken> [cajeraToken] [databaseUrl] [pgBin]')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function publicRequest(path) {
  const response = await fetch(`${baseUrl}${path}`)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const FORBIDDEN = ['costPyg', 'unitCostPyg', 'baseUnitCostPyg', 'notes', 'publicNote', 'phone', 'email', 'document', 'debtPyg', 'sellerId', 'receiptSnapshot']

// ── Ficha con crédito, dirección y una garantía activa ─────────────────────
let result = await request('/api/customers', 'POST', {
  name: `Cliente Portal ${ts}`,
  creditLimitPyg: 500000,
  creditDays: 15,
  addresses: [{ label: 'Casa', address: `Av. Portal ${ts}`, city: 'Asunción', country: 'Paraguay', isDefault: true }],
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cliente = result.payload
assert.ok(cliente.id)

// Otro cliente con su propio pedido: no debe filtrarse al portal del primero.
result = await request('/api/customers', 'POST', { name: `Cliente Portal Ajeno ${ts}` })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const clienteAjeno = result.payload

result = await request('/api/products', 'POST', { sku: `IT-PORTAL-SKU-${ts}`, name: 'Producto portal', pricePyg: 100000, stock: 5, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const producto = result.payload

result = await request('/api/products', 'POST', { sku: `IT-PORTAL-SKU-B-${ts}`, name: 'Producto portal ajeno', pricePyg: 100000, stock: 5, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoAjeno = result.payload

// Pedido del cliente con pago parcial a crédito: saldo 60.000 y vencimiento.
const numeroPedido = `IT-PORTAL-${ts}`
result = await request('/api/orders', 'POST', {
  orderNumber: numeroPedido,
  customerId: cliente.id,
  creditDays: 15,
  items: [{ productId: producto.id, description: 'Producto portal', quantity: 1, unitPricePyg: 100000 }],
  payment: { method: 'CASH', amountPyg: 40000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const pedido = result.payload
assert.ok(pedido.publicToken, 'El pedido del portal necesita token público.')

const numeroPedidoAjeno = `IT-PORTAL-AJENO-${ts}`
result = await request('/api/orders', 'POST', {
  orderNumber: numeroPedidoAjeno,
  customerId: clienteAjeno.id,
  items: [{ productId: productoAjeno.id, description: 'Producto ajeno', quantity: 1, unitPricePyg: 100000 }],
  payment: { method: 'CASH', amountPyg: 100000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

const serialGarantia = `IT-PORTAL-SER-${ts}`
result = await request('/api/warranties', 'POST', { customerId: cliente.id, customerName: cliente.name, serial: serialGarantia, description: 'Equipo con garantía portal', branchId: 'branch-a-it' }, adminToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

// ── Enlace rápido: saldo, vencimientos y pedidos, sin datos internos ───────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const tokenRapido = result.payload.token
assert.ok(tokenRapido, 'El nivel rápido debe devolver token.')
assert.equal(result.payload.level, 'rapido')

result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 200)
assert.equal(result.payload.token, tokenRapido, 'Sin regenerate el token vigente no debe rotar.')

result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const rapido = result.payload
assert.equal(rapido.level, 'rapido')
assert.equal(rapido.company.name, 'Tenant A Integration')
assert.equal(rapido.customer.name, cliente.name)
assert.equal(rapido.balancePyg, 60000, 'El saldo pendiente debe sumar solo lo no cobrado.')
assert.equal(rapido.dueDates.length, 1, 'El pedido a crédito debe listar su vencimiento.')
assert.equal(rapido.dueDates[0].orderNumber, numeroPedido)
assert.equal(rapido.dueDates[0].pendingPyg, 60000)
assert.ok(rapido.dueDates[0].dueAt, 'El vencimiento debe traer fecha.')
const pedidoPortal = rapido.orders.find(order => order.orderNumber === numeroPedido)
assert.ok(pedidoPortal, 'El portal debe listar el pedido del cliente.')
assert.equal(pedidoPortal.totalPyg, 100000)
assert.equal(pedidoPortal.pendingPyg, 60000)
assert.equal(pedidoPortal.status, 'PENDING')
assert.equal(pedidoPortal.fulfillmentStatus, 'PROCESSING')
assert.equal(rapido.orders.some(order => order.orderNumber === numeroPedidoAjeno), false, 'No deben aparecer pedidos de otro cliente.')
assert.equal('warranties' in rapido, false, 'El nivel rápido no expone garantías.')
assert.equal('addresses' in rapido, false, 'El nivel rápido no expone direcciones.')
assert.equal(pedidoPortal.receiptToken, undefined, 'El nivel rápido no expone enlaces de comprobantes.')
const serializado = JSON.stringify(rapido)
for (const campo of FORBIDDEN) {
  assert.equal(serializado.includes(campo), false, `El portal no debe exponer ${campo}.`)
}

// ── Enlace completo: garantías, direcciones y comprobantes ─────────────────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'completo' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const tokenCompleto = result.payload.token
assert.notEqual(tokenCompleto, tokenRapido, 'Cada nivel tiene su propio token.')

result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const completo = result.payload
assert.equal(completo.level, 'completo')
assert.equal(completo.balancePyg, 60000)
const garantia = (completo.warranties || []).find(item => item.serial === serialGarantia)
assert.ok(garantia, 'El nivel completo debe listar las garantías activas.')
assert.equal(garantia.description, 'Equipo con garantía portal')
assert.equal(garantia.status, 'RECEIVED')
assert.equal((completo.addresses || []).some(address => address.address === `Av. Portal ${ts}`), true, 'El nivel completo debe listar las direcciones.')
const pedidoCompleto = completo.orders.find(order => order.orderNumber === numeroPedido)
assert.equal(pedidoCompleto.receiptToken, pedido.publicToken, 'El pedido debe enlazar a su comprobante público.')
const serializadoCompleto = JSON.stringify(completo)
for (const campo of FORBIDDEN) {
  assert.equal(serializadoCompleto.includes(campo), false, `El portal completo no debe exponer ${campo}.`)
}

// ── Regeneración: el enlace anterior deja de funcionar ─────────────────────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido', regenerate: true }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.notEqual(result.payload.token, tokenRapido, 'Regenerar debe entregar un token nuevo.')
const tokenRapidoNuevo = result.payload.token
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}`)
assert.equal(result.response.status, 404, 'El token viejo debe dejar de funcionar al regenerar.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}/logo`)
assert.equal(result.response.status, 404, 'El logo del token revocado tampoco se entrega.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapidoNuevo)}`)
assert.equal(result.response.status, 200)
assert.equal(result.payload.balancePyg, 60000)

// ── Límites: token inválido, nivel inválido y rol sin permiso ──────────────
result = await publicRequest('/api/portal/token-inventado-que-no-existe')
assert.equal(result.response.status, 404)
result = await publicRequest('/api/portal/token-inventado-que-no-existe/logo')
assert.equal(result.response.status, 404)
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'detallado' }, sellerToken)
assert.equal(result.response.status, 400, 'Solo rápido y completo son niveles válidos.')
result = await request('/api/customers/cliente-inexistente-portal/access-token', 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 404, 'Un cliente inexistente no genera enlace.')
if (cajeraToken) {
  result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, cajeraToken)
  assert.equal(result.response.status, 403, 'Caja no genera enlaces del portal.')
}

// ── Auditoría: creación y regeneración con usuario ─────────────────────────
if (databaseUrl && pgBin) {
  const psql = (sql) => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'CUSTOMER_PORTAL_TOKEN_REGENERATED' AND "entityId" = '${cliente.id}' AND "userId" IS NOT NULL`), '1')
  assert.ok(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'CUSTOMER_PORTAL_TOKEN_CREATED' AND "entityId" = '${cliente.id}'`)) >= 2)
}

console.log('customer-portal: 40 checks OK (token rápido con saldo/vencimientos/pedidos, completo con garantías/direcciones/comprobantes, regeneración 404, token inválido, límites por rol y sin campos internos).')
