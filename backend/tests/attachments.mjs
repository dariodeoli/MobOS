#!/usr/bin/env node

// Adjuntos genéricos: alta multipart de un PNG para una compra, lista sin
// bytes, descarga con los mismos headers que los comprobantes, validaciones de
// entidad/MIME, alcance del vendedor y baja auditada.
// Uso: node backend/tests/attachments.mjs BASE_URL ADMIN_TOKEN [SELLER_TOKEN] [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, sellerToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: attachments.mjs <baseUrl> <adminToken> [sellerToken] [databaseUrl] [pgBin]')

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function upload(entity, entityId, file, type, name, token = adminToken) {
  const form = new FormData()
  form.append('entity', entity)
  form.append('entityId', entityId)
  form.append('file', new Blob([file], { type }), name)
  const response = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...tenantHeaders }, body: form })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

// 1. Compra de prueba para colgarle la factura.
const ts = Date.now()
let result = await request('/api/purchases', 'POST', { supplierName: `Proveedor adjuntos ${ts}`, branchId: 'branch-a-it', lines: [{ productId: 'prod-a-order-it', quantity: 1, unitCostPyg: 50000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const purchaseId = result.payload.id

// 2. Alta del adjunto con magic bytes reales.
result = await upload('PURCHASE', purchaseId, pngBytes, 'image/png', 'Factura Compra.PNG')
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.fileName, 'Factura_Compra.PNG')
assert.equal(result.payload.mimeType, 'image/png')
assert.equal(result.payload.sizeBytes, pngBytes.length)
assert.match(result.payload.sha256, /^[0-9a-f]{64}$/)
assert.equal(result.payload.uploadedBy?.name, 'Admin Test')
assert.ok(!('data' in result.payload) && !('storageKey' in result.payload), 'Los metadatos no deben exponer bytes ni storageKey.')
const attachmentId = result.payload.id

// 3. Lista del documento: un adjunto, sin bytes, con el mismo id.
result = await request(`/api/attachments?entity=PURCHASE&entityId=${encodeURIComponent(purchaseId)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 1)
assert.equal(result.payload[0].id, attachmentId)
assert.ok(!('data' in result.payload[0]) && !('storageKey' in result.payload[0]))

// 4. Descarga: bytes idénticos y headers de comprobante.
let response = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(attachmentId)}/download`, { headers: { Authorization: `Bearer ${adminToken}`, ...tenantHeaders } })
assert.equal(response.status, 200)
assert.equal(response.headers.get('content-type'), 'image/png')
assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
assert.match(response.headers.get('content-disposition') || '', /Factura_Compra\.PNG/)
assert.deepEqual(Buffer.from(await response.arrayBuffer()), pngBytes)

// 5. Validaciones: entidad desconocida, MIME no permitido, id inexistente.
result = await upload('USUARIO', purchaseId, pngBytes, 'image/png', 'factura.png')
assert.equal(result.response.status, 400, 'Una entidad desconocida debe rechazarse.')
result = await upload('PURCHASE', purchaseId, Buffer.from('factura falsa'), 'text/plain', 'factura.txt')
assert.equal(result.response.status, 415, 'Un MIME no permitido debe rechazarse.')
response = await fetch(`${baseUrl}/api/attachments/adjunto-inexistente/download`, { headers: { Authorization: `Bearer ${adminToken}`, ...tenantHeaders } })
assert.equal(response.status, 404, 'Un adjunto inexistente debe devolver 404.')
result = await request('/api/attachments', 'DELETE')
assert.equal(result.response.status, 400, 'La baja sin id debe rechazarse.')

// 6. El vendedor no ve compras: tampoco puede listar ni subir sus adjuntos.
if (sellerToken) {
  result = await request(`/api/attachments?entity=PURCHASE&entityId=${encodeURIComponent(purchaseId)}`, 'GET', undefined, sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe ver adjuntos de compras.')
  result = await upload('PURCHASE', purchaseId, pngBytes, 'image/png', 'intruso.png', sellerToken)
  assert.equal(result.response.status, 403, 'VENDEDOR no debe subir adjuntos de compras.')
}

// 7. Baja: la fila desaparece y la lista queda vacía.
result = await request(`/api/attachments?id=${encodeURIComponent(attachmentId)}`, 'DELETE')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.deleted, true)
result = await request(`/api/attachments?entity=PURCHASE&entityId=${encodeURIComponent(purchaseId)}`)
assert.equal(result.response.status, 200)
assert.equal(result.payload.length, 0, 'El adjunto eliminado no debe seguir en la lista.')

// 8. Trazabilidad: alta y baja quedaron auditadas.
if (databaseUrl && pgBin) {
  const psql = (sql) => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'ATTACHMENT_CREATED' AND "entityId" = '${attachmentId}'`), '1')
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'ATTACHMENT_DELETED' AND "entityId" = '${attachmentId}'`), '1')
}

// 9. Tombstone: los mismos bytes no vuelven solos al mismo documento (reintento
// o sincronización externa); una copia con otro hash sí entra.
result = await upload('PURCHASE', purchaseId, pngBytes, 'image/png', 'resubida.png')
assert.equal(result.response.status, 409, 'Los bytes eliminados no deben resucitar en el mismo documento.')
const otroPng = Buffer.concat([pngBytes, Buffer.from('copia-nueva')])
result = await upload('PURCHASE', purchaseId, otroPng, 'image/png', 'copia.png')
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

console.log('attachments: checks OK (alta multipart, metadatos sin bytes, descarga, validaciones, alcance del vendedor, baja auditada y tombstone).')
