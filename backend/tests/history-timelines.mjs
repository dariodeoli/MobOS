#!/usr/bin/env node

// Cronologías de cotización, compra, caja, gasto y funcionario: alta, cambios,
// pagos/adjuntos y shape {events:[{id,type,action,createdAt,user,detail}]} con
// más reciente primero, además del alcance de cada módulo.
// Uso: node backend/tests/history-timelines.mjs BASE_URL ADMIN_TOKEN [SELLER_TOKEN] [COMPANY_TOKEN]

import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken, companyToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: history-timelines.mjs <baseUrl> <adminToken> [sellerToken] [companyToken]')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function request(path, method = 'GET', body, token = adminToken, tenant = 'tenant-a-it') {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function upload(entity, entityId, token = adminToken) {
  const form = new FormData()
  form.append('entity', entity)
  form.append('entityId', entityId)
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'comprobante.png')
  const response = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...tenantHeaders }, body: form })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

// Shape común de toda cronología: array no vacío, campos completos, usuario
// nulo o {id, name} y orden descendente por createdAt.
function assertCronologia(payload, nombre, extra = '') {
  assert.ok(Array.isArray(payload?.events), `${nombre}: debe devolver { events: [] } ${extra}`)
  assert.ok(payload.events.length > 0, `${nombre}: debe traer al menos un evento ${extra}`)
  for (const event of payload.events) {
    assert.ok(event.id && event.type && event.action && event.createdAt, `${nombre}: evento sin id/type/action/createdAt ${extra}`)
    assert.ok('detail' in event && 'user' in event, `${nombre}: evento sin detail/user ${extra}`)
    assert.ok(event.user === null || (event.user.id && event.user.name), `${nombre}: user debe ser null o {id, name} ${extra}`)
    assert.ok(!Number.isNaN(Date.parse(event.createdAt)), `${nombre}: createdAt inválido ${extra}`)
  }
  for (let index = 1; index < payload.events.length; index += 1) {
    assert.ok(new Date(payload.events[index - 1].createdAt) >= new Date(payload.events[index].createdAt), `${nombre}: los eventos deben ir más reciente primero ${extra}`)
  }
  assert.ok(payload.events.length <= 300, `${nombre}: la cronología no debe superar 300 eventos ${extra}`)
}

const ts = Date.now()
let result

// 1. Cotización: alta, envío, historial del dueño y alcance ajeno.
result = await request('/api/quotes', 'POST', { customerName: `Cliente historial ${ts}`, notes: 'Nota de la cotización', items: [{ description: 'Equipo de prueba', quantity: 1, unitPricePyg: 150000 }] }, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const quote = result.payload
result = await request('/api/quotes', 'PATCH', { id: quote.id, status: 'SENT' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/quotes/${quote.id}/history`, 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assertCronologia(result.payload, 'cotización')
assert.ok(result.payload.events.some(event => event.action === 'Cotización creada' && event.detail.includes(quote.number)), 'Falta el alta de la cotización.')
assert.ok(result.payload.events.some(event => event.action === 'Estado actualizado' && /Borrador → Enviada/.test(event.detail)), 'Falta el cambio de estado auditado.')
result = await request(`/api/quotes/${quote.id}/history`, 'GET', undefined, adminToken)
assert.equal(result.response.status, 200, 'ADMIN debe ver la cronología de la cotización.')
if (sellerToken) {
  result = await request('/api/quotes', 'POST', { customerName: `Cotización ajena ${ts}`, items: [{ description: 'Equipo ajeno', quantity: 1, unitPricePyg: 100000 }] })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  result = await request(`/api/quotes/${result.payload.id}/history`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver la cronología de una cotización ajena.')
  result = await request(`/api/quotes/${quote.id}/history`, 'GET', undefined, companyToken)
  assert.equal(result.response.status, 401, 'La sesión de empresa no debe ver la cronología de cotizaciones.')
}
result = await request('/api/quotes/inexistente/history')
assert.equal(result.response.status, 404, 'Una cotización inexistente debe devolver 404.')

// 2. Compra: alta, costo, recepción, anticipo, adjunto y alcance del vendedor.
result = await request('/api/purchases', 'POST', { supplierName: `Proveedor historial ${ts}`, branchId: 'branch-a-it', lines: [{ productId: 'prod-a-order-it', quantity: 1, unitCostPyg: 50000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const purchase = result.payload
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'update-costs', lines: [{ id: purchase.lines[0].id, unitCostPyg: 45000, allocatedFeesPyg: 0 }] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/payment-accounts', 'POST', { name: `Cuenta historial ${ts}`, currency: 'PYG', kind: 'CASH' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'advance', accountId: result.payload.id, currency: 'PYG', originalAmount: 10000, reference: `ANT-HT-${ts}` })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/purchases', 'PATCH', { id: purchase.id, action: 'receive' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await upload('PURCHASE', purchase.id)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/purchases/${purchase.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assertCronologia(result.payload, 'compra')
assert.ok(result.payload.events.some(event => event.action === 'Compra creada' && event.detail.includes(`Proveedor historial ${ts}`)), 'Falta el alta de la compra.')
assert.ok(result.payload.events.some(event => event.action === 'Costo de línea actualizado'), 'Falta el cambio de costo.')
assert.ok(result.payload.events.some(event => event.action === 'Compra recibida (stock sumado)'), 'Falta la recepción con suma de stock.')
assert.ok(result.payload.events.some(event => event.action === 'Anticipo a proveedor'), 'Falta el anticipo.')
assert.ok(result.payload.events.some(event => event.type === 'attachment' && event.detail === 'comprobante.png'), 'Falta el adjunto de la compra.')
if (sellerToken) {
  result = await request(`/api/purchases/${purchase.id}/history`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver la cronología de compras.')
}
result = await request('/api/purchases/inexistente/history')
assert.equal(result.response.status, 404, 'Una compra inexistente debe devolver 404.')

// 3. Caja: apertura, movimiento y cronología de la sesión.
result = await request('/api/cash?branchId=branch-a-it')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
let cashSession = result.payload
if (!cashSession || cashSession.status !== 'OPEN') {
  result = await request('/api/cash?branchId=branch-a-it', 'POST', { action: 'open', openingPyg: 100000 })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  cashSession = result.payload
}
result = await request('/api/cash?branchId=branch-a-it', 'POST', { action: 'movement', kind: 'CHEQUE', direction: 'OUT', currency: 'PYG', originalAmount: 5000, description: `Cheque historial ${ts}` })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/cash/sessions/${cashSession.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assertCronologia(result.payload, 'caja')
assert.ok(result.payload.events.some(event => event.action === 'Caja abierta' && event.detail.includes('Fondo inicial')), 'Falta la apertura de la caja.')
assert.ok(result.payload.events.some(event => event.action.includes('Cheque') && event.detail.includes(`Cheque historial ${ts}`)), 'Falta el movimiento de caja.')
result = await upload('CASH_SESSION', cashSession.id)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/cash/sessions/${cashSession.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.events.some(event => event.action === 'Foto de arqueo adjuntada'), 'Falta la foto de arqueo en la cronología de caja.')
if (sellerToken) {
  result = await request(`/api/cash/sessions/${cashSession.id}/history`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver la cronología de caja.')
}

// 4. Gasto: alta, comprobante y cronología.
result = await request('/api/finance?branchId=branch-a-it', 'POST', { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: 7000, description: `Gasto historial ${ts}`, counterparty: 'Proveedor de prueba' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const expense = result.payload
result = await upload('EXPENSE', expense.id)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/expenses/${expense.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assertCronologia(result.payload, 'gasto')
assert.ok(result.payload.events.some(event => event.type === 'expense' && event.action === 'Gasto registrado' && event.detail.includes(`Gasto historial ${ts}`)), 'Falta el alta del gasto.')
assert.ok(result.payload.events.some(event => event.type === 'attachment' && event.detail === 'comprobante.png'), 'Falta el comprobante del gasto.')
result = await request('/api/expenses/inexistente/history')
assert.equal(result.response.status, 404, 'Un gasto inexistente debe devolver 404.')

// 5. Funcionario: auditoría de la cuenta, comisiones y últimas ventas.
result = await request('/api/users/user-a-it/history')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assertCronologia(result.payload, 'funcionario')
assert.ok(result.payload.events.some(event => event.type === 'user'), 'Falta la auditoría del usuario.')
assert.ok(result.payload.events.some(event => event.type === 'sale' && event.detail.includes('IT-ORDER-001')), 'Las ventas del vendedor deben aparecer en la cronología.')
assert.ok(!JSON.stringify(result.payload).match(/pinHash/i), 'La cronología no debe exponer el hash del PIN.')
if (sellerToken) {
  result = await request('/api/users/user-a-it/history', 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver la cronología de funcionarios.')
}
result = await request('/api/users/inexistente/history')
assert.equal(result.response.status, 404, 'Un usuario inexistente debe devolver 404.')

console.log('history-timelines: checks OK (cotización, compra, caja, gasto y funcionario con shape 200 y alcance por rol).')
