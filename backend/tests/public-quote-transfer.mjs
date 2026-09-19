// Cotización con aceptar/rechazar desde el enlace público y remito de
// transferencia con recepción desde el QR: token válido/inválido, doble
// resolución, stock y unidades tras recibir, rotación de enlaces, foto del
// remito sin sesión y auditoría con origen público.
// Uso: node backend/tests/public-quote-transfer.mjs BASE_URL ADMIN_TOKEN [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: public-quote-transfer.mjs <baseUrl> <adminToken> [databaseUrl] [pgBin]')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function publicRequest(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()

// ── Cotización: aceptar desde el enlace público (una sola vez) ─────────────
let result = await request('/api/quotes', 'POST', {
  customerName: `Cliente público ${ts}`,
  validUntil: new Date(Date.now() + 3 * 86400000).toISOString(),
  items: [{ description: 'Equipo cotizado público', quantity: 2, unitPricePyg: 500000 }],
  discountPyg: 100000,
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const quoteAceptada = result.payload
assert.equal(quoteAceptada.totalPyg, 900000)
assert.ok(quoteAceptada.publicToken, 'La cotización nueva debe nacer con token público.')

result = await request(`/api/quotes/${encodeURIComponent(quoteAceptada.id)}/access-token`, 'POST', {})
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.token, quoteAceptada.publicToken, 'El token vigente no debe rotar sin regenerate.')
let tokenAceptada = result.payload.token

result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenAceptada)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.number, quoteAceptada.number)
assert.equal(result.payload.status, 'DRAFT')
assert.equal(result.payload.items.length, 1)
assert.equal(result.payload.items[0].quantity, 2)
assert.equal(result.payload.totalPyg, 900000)
assert.ok(result.payload.company?.name, 'La vista pública debe mostrar la empresa.')
assert.equal(result.payload.resolution, null)

result = await publicRequest('/api/quotes/public/token-inventado-que-no-existe')
assert.equal(result.response.status, 404)

result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenAceptada)}`, 'POST', { action: 'accept' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'ACCEPTED')

result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenAceptada)}`, 'POST', { action: 'accept' })
assert.equal(result.response.status, 409, 'La segunda resolución debe rechazarse.')
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenAceptada)}`, 'POST', { action: 'reject' })
assert.equal(result.response.status, 409, 'Aceptar y rechazar la misma cotización no es posible.')

result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenAceptada)}`)
assert.equal(result.payload.status, 'ACCEPTED')
assert.equal(result.payload.resolution?.status, 'ACCEPTED')

// ── Cotización: rechazar con motivo y regenerar el enlace ──────────────────
result = await request('/api/quotes', 'POST', { customerName: `Cliente rechaza ${ts}`, items: [{ description: 'Ítem rechazado', quantity: 1, unitPricePyg: 250000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const quoteRechazada = result.payload
result = await request(`/api/quotes/${encodeURIComponent(quoteRechazada.id)}/access-token`, 'POST', {})
assert.equal(result.response.status, 200)
const tokenViejo = result.payload.token

result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenViejo)}`, 'POST', { action: 'reject', note: 'El precio no me conviene' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'REJECTED')
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenViejo)}`, 'POST', { action: 'accept' })
assert.equal(result.response.status, 409, 'Una cotización rechazada no se puede aceptar después.')
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenViejo)}`)
assert.equal(result.payload.resolution?.note, 'El precio no me conviene', 'El motivo del rechazo debe quedar visible.')

result = await request(`/api/quotes/${encodeURIComponent(quoteRechazada.id)}/access-token`, 'POST', { regenerate: true })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.notEqual(result.payload.token, tokenViejo, 'Regenerar debe entregar un token nuevo.')
const tokenNuevo = result.payload.token
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenViejo)}`)
assert.equal(result.response.status, 404, 'El token viejo debe dejar de funcionar al regenerar.')
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenNuevo)}`)
assert.equal(result.response.status, 200)

// ── Cotización vencida: no admite resolución ───────────────────────────────
result = await request('/api/quotes', 'POST', { customerName: `Cliente vencido ${ts}`, validUntil: new Date(Date.now() - 86400000).toISOString(), items: [{ description: 'Ítem vencido', quantity: 1, unitPricePyg: 1000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const quoteVencida = result.payload
result = await request(`/api/quotes/${encodeURIComponent(quoteVencida.id)}/access-token`, 'POST', {})
assert.equal(result.response.status, 200)
const tokenVencida = result.payload.token
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenVencida)}`, 'POST', { action: 'accept' })
assert.equal(result.response.status, 409, 'Una cotización vencida no se acepta.')
result = await publicRequest(`/api/quotes/public/${encodeURIComponent(tokenVencida)}`)
assert.equal(result.payload.status, 'EXPIRED')

// ── Remito: recepción pública con stock, unidades y foto ───────────────────
const serial = `PUBLIC-TRANSFER-${ts}`
const normalizedSerial = serial.replace(/[^A-Z0-9]/gi, '').toUpperCase()
const sku = `PUBLIC-TRANSFER-SKU-${ts}`
result = await request('/api/products', 'POST', { sku, name: 'Equipo público de transferencia', pricePyg: 800000, costPyg: 600000, stock: 1, branchId: 'branch-a-it', imei: serial })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const sourceProduct = result.payload

result = await request('/api/transfers', 'POST', { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', notes: 'Remito público', lines: [{ productId: sourceProduct.id, quantity: 1, serials: [serial] }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const transfer = result.payload
assert.ok(transfer.publicToken, 'El traslado debe tener enlace público para el QR.')

result = await request(`/api/transfers/${encodeURIComponent(transfer.id)}/access-token`, 'POST', {})
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.token, transfer.publicToken)
const transferToken = result.payload.token

result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'IN_TRANSIT')
assert.equal(result.payload.receivedAt, null)
assert.equal(result.payload.lines.length, 1)
assert.deepEqual(result.payload.lines[0].serials, [normalizedSerial])
assert.equal(result.payload.sourceBranch?.name, 'Sucursal A')
assert.equal(result.payload.destinationBranch?.name, 'Sucursal A2')

result = await publicRequest('/api/transfers/public/token-inventado-que-no-existe')
assert.equal(result.response.status, 404)

// Confirmar sin todos los seriales no registra nada.
result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}`, 'POST', { action: 'receive', serialsOk: [] })
assert.equal(result.response.status, 409, 'Confirmar sin las unidades del remito debe rechazarse.')

// Foto del remito sin sesión: el token acota al traslado.
const photoForm = new FormData()
photoForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'remito-recibido.png')
let photoResponse = await fetch(`${baseUrl}/api/transfers/public/${encodeURIComponent(transferToken)}/attachments`, { method: 'POST', body: photoForm })
let photoPayload = await photoResponse.json().catch(() => null)
assert.equal(photoResponse.status, 201, JSON.stringify(photoPayload))
assert.ok(photoPayload.id)
assert.equal(photoPayload.uploadedBy, null, 'La foto pública no tiene usuario de sesión.')
const publicPhotoId = photoPayload.id

result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}`)
assert.ok(result.payload.photos.some(photo => photo.id === publicPhotoId), 'El remito público debe listar su foto.')
result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}/attachments?id=${encodeURIComponent(publicPhotoId)}`)
assert.equal(result.response.status, 200, 'La foto pública debe poder descargarse con el token.')
assert.equal(result.response.headers.get('content-type'), 'image/png')
// La misma foto queda visible desde el endpoint interno de adjuntos.
result = await request(`/api/attachments?entity=STOCK_TRANSFER&entityId=${encodeURIComponent(transfer.id)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(photo => photo.id === publicPhotoId), 'El adjunto público debe verse desde el panel interno.')

// Recepción completa: unidades a disponible y stock de destino sumado.
result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}`, 'POST', { action: 'receive', note: 'Llegó completo', serialsOk: [serial] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'RECEIVED')
assert.ok(result.payload.receivedAt)
assert.deepEqual(result.payload.serials, [normalizedSerial])

result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferToken)}`, 'POST', { action: 'receive' })
assert.equal(result.response.status, 409, 'No se recibe dos veces el mismo remito.')

result = await request('/api/products')
assert.equal(result.response.status, 200)
assert.equal(result.payload.find(product => product.id === sourceProduct.id).stock, 0, 'El origen queda sin stock.')
const destination = result.payload.find(product => product.sku === sku && product.branchId === 'branch-a2-it')
assert.ok(destination, 'Debe existir el producto espejo en destino.')
assert.equal(destination.stock, 1, 'La recepción pública debe sumar el stock de destino.')

result = await request(`/api/inventory-units?branchId=branch-a2-it&q=${encodeURIComponent(serial)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const receivedUnit = result.payload.find(unit => unit.serial === normalizedSerial)
assert.ok(receivedUnit, 'La unidad recibida debe estar en la sucursal destino.')
assert.equal(receivedUnit.status, 'AVAILABLE')

// ── Remito sin seriales: la recepción marca el cierre igual ────────────────
const skuSinSerial = `PUBLIC-TRANSFER-NOSERIAL-${ts}`
result = await request('/api/products', 'POST', { sku: skuSinSerial, name: 'Accesorio público de transferencia', pricePyg: 50000, stock: 1, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request('/api/transfers', 'POST', { sourceBranchId: 'branch-a-it', destinationBranchId: 'branch-a2-it', lines: [{ productId: result.payload.id, quantity: 1, serials: [] }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const transferSinSeriales = result.payload
result = await publicRequest(`/api/transfers/public/${encodeURIComponent(transferSinSeriales.publicToken)}`, 'POST', { action: 'receive' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'RECEIVED')

// ── Auditoría: origen público y sin usuario de sesión ──────────────────────
if (databaseUrl && pgBin) {
  const psql = (sql) => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'QUOTE_ACCEPTED' AND "entityId" = '${quoteAceptada.id}' AND "userId" IS NULL AND "metadata"->>'origin' = 'public'`), '1')
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'QUOTE_REJECTED' AND "entityId" = '${quoteRechazada.id}' AND "userId" IS NULL AND "metadata"->>'note' = 'El precio no me conviene'`), '1')
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'STOCK_TRANSFER_RECEIVED' AND "entityId" = '${transfer.id}' AND "userId" IS NULL AND "metadata"->>'origin' = 'public'`), '1')
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'INVENTORY_TRANSIT_RECEIVED' AND "metadata"->>'serial' = '${normalizedSerial}' AND "metadata"->>'origin' = 'public'`), '1')
}

console.log('public-quote-transfer: 40 checks OK (cotización aceptar/rechazar/doble resolución, token inválido, regeneración; remito recepción, stock y unidades, doble recepción, foto pública y auditoría).')
