import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: mobos-1.2.mjs <baseUrl> <adminToken> [sellerToken]')

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function upload(path, bytes, mime, filename, fields = {}, token = adminToken) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), filename)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const today = new Date().toISOString().slice(0, 10)
const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
const ts = Date.now()
const serial = `M12-IMEI-${ts}`
const normalizedSerial = serial.replace(/[\s-]+/g, '').toUpperCase()
let result

// 1. Alertas de stock: umbral de reposición y productos agotados.
result = await request('/api/products', 'POST', { sku: `M12-ALERT-${ts}`, name: 'Equipo con umbral de reposición', pricePyg: 100000, costPyg: 60000, stock: 1, reorderPoint: 2, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const alertProduct = result.payload
result = await request('/api/products', 'POST', { sku: `M12-ZERO-${ts}`, name: 'Equipo agotado sin umbral', pricePyg: 50000, stock: 0, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const zeroProduct = result.payload

result = await request(`/api/stock-alerts?branchId=branch-a-it`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const alertRow = result.payload.alerts.find(item => item.id === alertProduct.id)
assert.ok(alertRow, 'El producto bajo el umbral no aparece en las alertas.')
assert.equal(alertRow.level, 'LOW')
assert.equal(alertRow.stockMinimum, 2)
const outRow = result.payload.outOfStock.find(item => item.id === zeroProduct.id)
assert.ok(outRow, 'El producto sin stock no aparece en agotados.')
assert.equal(outRow.level, 'OUT')
if (sellerToken) {
  result = await request('/api/stock-alerts', 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe acceder a stock-alerts.')
}

// 2. Historial de unidad por IMEI/serial.
result = await request('/api/products', 'POST', { sku: `M12-HIST-${ts}`, name: 'Equipo con historial', pricePyg: 900000, costPyg: 700000, stock: 1, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const historyProduct = result.payload
result = await request('/api/inventory-units', 'POST', { productId: historyProduct.id, serial, branchId: 'branch-a-it', notes: 'Unidad para historial' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/inventory-units?branchId=branch-a-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const historyUnit = result.payload.find(item => item.serial === normalizedSerial)
assert.ok(historyUnit, 'La unidad creada debe encontrarse por serial.')
result = await request('/api/inventory-units', 'PATCH', { id: historyUnit.id, action: 'adjust', reason: 'Ajuste de prueba para historial' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/inventory-units/${historyUnit.id}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.unit.serial, normalizedSerial)
const actions = result.payload.events.map(event => event.action)
assert.ok(actions.includes('INVENTORY_UNIT_RECEIVED'), 'Falta la recepción en el historial.')
assert.ok(actions.includes('INVENTORY_UNIT_ADJUSTED'), 'Falta el ajuste en el historial.')
assert.equal(result.payload.events[0].action, 'INVENTORY_UNIT_ADJUSTED', 'El historial debe ir por fecha descendente.')
assert.ok(result.payload.events.every(event => event.type === 'audit' || event.type === 'transfer'))
assert.ok(result.payload.events[0].user, 'Cada evento debe conservar su usuario.')
if (sellerToken) {
  result = await request(`/api/inventory-units/${historyUnit.id}/history`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe acceder al historial.')
}

// 3. Cliente 360: órdenes, deuda, notas, seguimientos y garantías.
const customerName = `Cliente 360 ${ts}`
result = await request('/api/customers', 'POST', { name: customerName, phone: `0981${ts % 10000000}`, document: `DOC-360-${ts}` })
assert.ok([200, 201].includes(result.response.status), JSON.stringify(result.payload))
const customer = result.payload
result = await request('/api/orders', 'POST', { orderNumber: `M12-ORD-${ts}`, customerId: customer.id, items: [{ productId: alertProduct.id, description: alertProduct.name, quantity: 1, unitPricePyg: 100000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/customers/${customer.id}/notes`, 'POST', { content: 'Nota interna de prueba 360' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const adminNote = result.payload
result = await request(`/api/customers/${customer.id}/follow-ups`, 'POST', { note: 'Llamar el lunes para ofrecer accesorios', kind: 'CALL', dueAt: new Date(Date.now() + 86400000).toISOString() })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const followUp = result.payload
result = await request('/api/warranties', 'POST', { customerName, serial: `M12-WARR-${ts}`, description: 'Equipo no enciende', branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const warrantyCase = result.payload

result = await request(`/api/customers/${customer.id}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const profile = result.payload
assert.equal(profile.customer.id, customer.id)
assert.ok(profile.orders.length >= 1, 'La ficha 360 debe incluir las órdenes del cliente.')
const order360 = profile.orders.find(order => order.orderNumber === `M12-ORD-${ts}`)
assert.ok(order360, 'La orden creada debe aparecer en el perfil 360.')
assert.equal(order360.totalPyg, 100000)
assert.equal(order360.pendingPyg, 100000)
assert.equal(profile.debtPyg, 100000)
assert.ok(profile.notes.some(note => note.id === adminNote.id), 'La nota debe aparecer en el perfil 360.')
assert.ok(profile.followUps.some(item => item.id === followUp.id && item.kind === 'CALL'), 'El seguimiento debe aparecer en el perfil 360.')
assert.ok(profile.warranties.some(item => item.serial === `M12-WARR-${ts}`), 'La garantía del equipo debe aparecer en el perfil 360.')
if (sellerToken) {
  result = await request(`/api/customers/${customer.id}`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
}

result = await request(`/api/customers/${customer.id}/notes`, 'PATCH', { id: adminNote.id, content: 'Nota actualizada por admin' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.content, 'Nota actualizada por admin')
if (sellerToken) {
  result = await request(`/api/customers/${customer.id}/notes`, 'POST', { content: 'Nota del vendedor' }, sellerToken)
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  const sellerNote = result.payload
  result = await request(`/api/customers/${customer.id}/notes`, 'DELETE', { id: adminNote.id }, sellerToken)
  assert.equal(result.response.status, 403, 'Solo el autor o un admin puede borrar la nota.')
  result = await request(`/api/customers/${customer.id}/notes`, 'PATCH', { id: sellerNote.id, content: 'Nota del vendedor editada' })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
  result = await request(`/api/customers/${customer.id}/notes`, 'DELETE', { id: sellerNote.id })
  assert.equal(result.response.status, 200, JSON.stringify(result.payload))
}
result = await request(`/api/customers/${customer.id}/follow-ups`, 'DELETE', { id: followUp.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))

// 4. Reglas de comisión: CRUD y validación.
result = await request('/api/commission-rules', 'POST', { userId: 'user-a-it', percentPyg: 10 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const rule = result.payload
result = await request('/api/commission-rules', 'POST', { percentPyg: 10 })
assert.equal(result.response.status, 400, 'La regla sin usuario ni rol debe rechazarse.')
result = await request('/api/commission-rules', 'POST', { userId: 'user-a-it', role: 'ADMIN', percentPyg: 10 })
assert.equal(result.response.status, 400, 'La regla con usuario y rol a la vez debe rechazarse.')
result = await request('/api/commission-rules', 'POST', { userId: 'user-a-it', percentPyg: 101 })
assert.equal(result.response.status, 400, 'El porcentaje fuera de 0-100 debe rechazarse.')
result = await request('/api/commission-rules')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(item => item.id === rule.id), 'La regla creada debe listarse.')
result = await request('/api/commission-rules', 'PATCH', { id: rule.id, percentPyg: 15 })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.percentPyg, 15)
if (sellerToken) {
  result = await request('/api/commission-rules', 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'Solo ADMIN gestiona las reglas de comisión.')
}
result = await request('/api/commission-rules', 'DELETE', { id: rule.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))

// 5. Fotos de garantía: subida multipart con magic bytes, listado sin bytes y descarga.
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
const pngSha = createHash('sha256').update(pngBytes).digest('hex')
result = await upload(`/api/warranties/${warrantyCase.id}/photos`, pngBytes, 'image/png', 'foto-garantia.png', { label: 'Pantalla rota' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const photo = result.payload
assert.equal(photo.sha256, pngSha)
assert.equal(photo.label, 'Pantalla rota')
assert.ok(!('data' in photo), 'La respuesta de subida no debe incluir los bytes.')
result = await upload(`/api/warranties/${warrantyCase.id}/photos`, new TextEncoder().encode('no soy una imagen'), 'image/png', 'falsa.png')
assert.equal(result.response.status, 415, 'El contenido que no coincide con su MIME debe rechazarse.')
result = await request(`/api/warranties/${warrantyCase.id}/photos`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 1)
assert.ok(!('data' in result.payload[0]), 'El listado no debe incluir bytes.')
const download = await fetch(`${baseUrl}/api/warranties/${warrantyCase.id}/photos/${photo.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })
assert.equal(download.status, 200)
assert.equal(download.headers.get('content-type'), 'image/png')
const downloaded = new Uint8Array(await download.arrayBuffer())
assert.deepEqual(downloaded, pngBytes, 'La descarga debe devolver los bytes originales.')

// 6. Reporte de comisiones por vendedor sobre margen.
result = await request('/api/commission-rules', 'POST', { role: 'ADMIN', percentPyg: 10 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const roleRule = result.payload
result = await request('/api/commission-rules', 'POST', { userId: 'user-admin-it', percentPyg: 20 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const userRule = result.payload
result = await request(`/api/reports?type=commissions&from=${fiveDaysAgo}&to=${today}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const commissions = result.payload
assert.equal(commissions.type, 'commissions')
assert.ok(Array.isArray(commissions.sellers) && commissions.sellers.length > 0, 'El reporte debe listar vendedores.')
const adminRow = commissions.sellers.find(row => row.sellerId === 'user-admin-it')
assert.ok(adminRow, 'Las ventas del admin deben aparecer en el reporte de comisiones.')
assert.equal(adminRow.commissionPct, 20, 'La regla por usuario debe prevalecer sobre la de rol.')
assert.ok(adminRow.marginPyg > 0, 'El margen del admin debe ser positivo.')
assert.equal(adminRow.commissionPyg, Math.round((adminRow.marginPyg * adminRow.commissionPct) / 100))
const sellerRow = commissions.sellers.find(row => row.sellerId === 'user-a-it')
if (sellerRow) {
  assert.equal(sellerRow.commissionPct, null, 'Sin regla vigente no debe haber porcentaje de comisión.')
  assert.equal(sellerRow.commissionPyg, 0)
}
if (sellerToken) {
  result = await request(`/api/reports?type=commissions&from=${fiveDaysAgo}&to=${today}`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe acceder a comisiones.')
}
result = await request('/api/commission-rules', 'DELETE', { id: userRule.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/commission-rules', 'DELETE', { id: roleRule.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))

console.log('mobos-1.2: checks OK (stock-alerts, historial de unidad, cliente 360, notas/seguimientos, comisiones y fotos de garantía).')
