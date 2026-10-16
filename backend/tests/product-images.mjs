#!/usr/bin/env node

// #404: fotos de producto — alta multipart (JPG/PNG/WebP por magic bytes),
// rechazos (tipo, tamaño, MIME falso), listado/foto principal, reorden, bytes
// con aislamiento por empresa (otra empresa → 404), baja lógica y categorías de
// accesorios. Uso: node backend/tests/product-images.mjs BASE_URL ADMIN_TOKEN SELLER_TOKEN OTHER_TENANT_ADMIN_TOKEN [STORAGE_DIR]

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [baseUrl, adminToken, sellerToken, otherTenantToken, storageDir] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !otherTenantToken) throw new Error('Uso: product-images.mjs <baseUrl> <adminToken> <sellerToken> <otherTenantAdminToken> [storageDir]')

const png = await sharp({create:{width:1200,height:600,channels:3,background:'#d63456'}}).png().toBuffer()
const webp = await sharp({create:{width:160,height:160,channels:3,background:'#12ab34'}}).webp().toBuffer()
const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }

async function call(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { response, payload: await response.json().catch(() => null) }
}

async function upload(productId, file, type, token = adminToken, extra = {}) {
  const form = new FormData()
  form.append('file', new Blob([file], { type }), 'foto')
  for (const [key, value] of Object.entries(extra)) form.append(key, value instanceof Blob ? value : String(value))
  const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...tenantHeaders }, body: form })
  return { response, payload: await response.json().catch(() => null) }
}

const bytes = (id, productId, query = '', token = adminToken) => fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(id)}${query}`, { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders } })

// Producto propio para no tocar los de otros tests.
let result = await call('/api/products', 'POST', { sku: `IMG-${Date.now()}`, name: 'Lámina vidrio templado iPhone 17 Pro', category: 'Accesorios', pricePyg: 45000, stock: 8, branchId: 'branch-a-it', accessoryCategory: 'lamina', compatibleModels: ['iPhone 17 Pro', 'iphone 17 pro', 'iPhone 17'] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productId = result.payload.id
assert.equal(result.payload.accessoryCategory, 'LAMINA')
assert.deepEqual(result.payload.compatibleModels, ['iPhone 17 Pro', 'iPhone 17'])

// Categoría inválida.
result = await call('/api/products', 'POST', { sku: `IMG-BAD-${Date.now()}`, name: 'Mal', pricePyg: 1, stock: 1, branchId: 'branch-a-it', accessoryCategory: 'MAGIA' })
assert.equal(result.response.status, 400, 'Una categoría de accesorio desconocida debe rechazarse.')

// Sin fotos: el listado trae imageUrl nulo.
result = await call('/api/products?q=Lámina%20vidrio')
assert.equal(result.response.status, 200)
let listed = result.payload.find(item => item.id === productId)
assert.equal(listed.imageUrl, null)
assert.equal(listed.accessoryCategory, 'LAMINA')

// Rechazos: tipo, MIME falso, tamaño, vacío.
result = await upload(productId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')
assert.equal(result.response.status, 415, 'SVG no se admite.')
result = await upload(productId, Buffer.from('no soy una imagen'), 'image/png')
assert.equal(result.response.status, 415, 'Bytes que no son PNG con MIME PNG se rechazan.')
result = await upload(productId, png, 'image/jpeg')
assert.equal(result.response.status, 415, 'MIME declarado distinto del contenido se rechaza.')
result = await upload(productId, Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 10)]), 'image/png')
assert.equal(result.response.status, 413, 'Más de 5 MiB se rechaza.')
result = await upload(productId, Buffer.alloc(0), 'image/png')
assert.equal(result.response.status, 400, 'Archivo vacío se rechaza.')
result = await upload(productId, png, 'image/png', adminToken, { thumb: new Blob([png], { type: 'image/png' }) })
assert.equal(result.response.status, 415, 'La miniatura debe ser WebP.')
result = await call(`/api/products/${productId}/images`)
assert.equal(result.payload.length, 0, 'Los rechazos no dejan fotos.')

// Alta válida: la primera queda principal; la segunda no.
result = await upload(productId, png, 'image/png', adminToken, { thumb: new Blob([webp], { type: 'image/webp' }) })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const first = result.payload
assert.equal(first.isPrimary, true)
assert.equal(first.position, 0)
assert.equal(first.width, 800)
assert.equal(first.height, 800)
assert.equal(first.contentType, 'image/webp')
assert.ok(!('data' in first) && !('storagePath' in first), 'No se exponen bytes ni rutas.')
result = await upload(productId, webp, 'image/webp')
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const second = result.payload
assert.equal(second.isPrimary, false)
assert.equal(second.position, 1)
result = await upload(productId, png, 'image/png')
assert.equal(result.response.status, 201)
const third = result.payload

if (storageDir) {
  const tenantFolder = path.join(storageDir, 'tenant-a-it', 'product-images')
  assert.ok(existsSync(tenantFolder), 'Las fotos se guardan bajo la carpeta de la empresa.')
}

// Bytes: grande, miniatura WebP, headers de caché; 304 con ETag.
let response = await bytes(first.id, productId)
assert.equal(response.status, 200)
assert.equal(response.headers.get('content-type'), 'image/webp')
assert.match(response.headers.get('cache-control') || '', /max-age=31536000/)
assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
const mainBytes=Buffer.from(await response.arrayBuffer())
assert.equal((await sharp(mainBytes).metadata()).width,800)
assert.notDeepEqual(mainBytes,png,'Sólo se sirve el derivado, no el original PNG.')
const etag = response.headers.get('etag')
assert.ok(etag)
response = await fetch(`${baseUrl}/api/products/${productId}/images/${first.id}`, { headers: { Authorization: `Bearer ${adminToken}`, ...tenantHeaders, 'If-None-Match': etag } })
assert.equal(response.status, 304)
response = await bytes(first.id, productId, '?size=thumb')
assert.equal(response.headers.get('content-type'), 'image/webp')
const thumbBytes=Buffer.from(await response.arrayBuffer())
const thumbMeta=await sharp(thumbBytes).metadata()
assert.deepEqual([thumbMeta.width,thumbMeta.height,thumbMeta.format],[160,160,'webp'])
assert.notDeepEqual(thumbBytes,webp,'El servidor no usa los píxeles verdes de la miniatura del cliente.')
const pixel=await sharp(thumbBytes).resize(1,1).raw().toBuffer()
assert.ok(pixel[0]>150&&pixel[1]<100,'La miniatura deriva de la foto roja original.')
response = await bytes(second.id, productId, '?size=thumb')
assert.equal(response.status, 200, 'Sin miniatura cliente también se genera derivado160.')
assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,160)

// Listado de Productos: foto principal.
result = await call('/api/products?q=Lámina%20vidrio')
listed = result.payload.find(item => item.id === productId)
assert.equal(listed.imageUrl, `/api/products/${productId}/images/${first.id}`)
assert.equal(listed.thumbUrl, `/api/products/${productId}/images/${first.id}?size=thumb`)
result = await call('/api/products?page=1&pageSize=50&q=Lámina%20vidrio')
assert.equal(result.payload.items.find(item => item.id === productId).imageUrl, listed.imageUrl)

// Otra empresa: todo es 404 (listado, bytes, alta, reorden, baja).
result = await call(`/api/products/${productId}/images`, 'GET', undefined, otherTenantToken)
assert.equal(result.response.status, 404)
response = await bytes(first.id, productId, '', otherTenantToken)
assert.equal(response.status, 404, 'Otra empresa no ve los bytes.')
result = await upload(productId, png, 'image/png', otherTenantToken)
assert.equal(result.response.status, 404)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'primary', imageId: second.id }, otherTenantToken)
assert.equal(result.response.status, 404)
result = await call(`/api/products/${productId}/images/${first.id}`, 'DELETE', undefined, otherTenantToken)
assert.equal(result.response.status, 404)

// Permisos: el vendedor ve fotos pero no las gestiona.
result = await call(`/api/products/${productId}/images`, 'GET', undefined, sellerToken)
assert.equal(result.response.status, 200)
assert.equal(result.payload.length, 3)
result = await upload(productId, png, 'image/png', sellerToken)
assert.equal(result.response.status, 403)
result = await call(`/api/products/${productId}/images/${first.id}`, 'DELETE', undefined, sellerToken)
assert.equal(result.response.status, 403)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'primary', imageId: second.id }, sellerToken)
assert.equal(result.response.status, 403)

// Reordenar: lista completa y sin repetidos; una incompleta se rechaza.
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'reorder', order: [third.id, first.id] })
assert.equal(result.response.status, 400)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'reorder', order: [third.id, third.id, first.id] })
assert.equal(result.response.status, 400)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'reorder', order: [third.id, second.id, first.id] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
// La principal siempre va primera; el resto sigue el orden pedido.
assert.deepEqual(result.payload.map(image => image.id), [first.id, third.id, second.id])
assert.deepEqual(result.payload.map(image => image.position).sort(), [0, 1, 2])

// Principal: cambia y queda una sola.
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'primary', imageId: third.id })
assert.equal(result.response.status, 200)
assert.equal(result.payload.filter(image => image.isPrimary).length, 1)
assert.equal(result.payload[0].id, third.id)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'primary', imageId: 'no-existe' })
assert.equal(result.response.status, 404)
result = await call(`/api/products/${productId}/images`, 'PATCH', { action: 'otra' })
assert.equal(result.response.status, 400)

// Baja lógica: la principal se oculta, otra pasa a principal y los bytes dan 404.
result = await call(`/api/products/${productId}/images/${third.id}`, 'DELETE')
assert.equal(result.response.status, 200)
response = await bytes(third.id, productId)
assert.equal(response.status, 404, 'Una foto ocultada no se sirve.')
result = await call(`/api/products/${productId}/images`)
assert.equal(result.payload.length, 2)
assert.equal(result.payload.filter(image => image.isPrimary).length, 1, 'Siempre queda una principal.')
result = await call(`/api/products/${productId}/images/${third.id}`, 'DELETE')
assert.equal(result.response.status, 404, 'Borrar dos veces da 404.')
result = await call('/api/products?q=Lámina%20vidrio')
assert.notEqual(result.payload.find(item => item.id === productId).imageUrl, `/api/products/${productId}/images/${third.id}`)

// Editar categoría y compatibilidad desde la ficha.
result = await call('/api/products', 'PATCH', { id: productId, accessoryCategory: 'CASE', compatibleModels: 'iPhone 17 Pro Max, iPhone 17 Pro' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.accessoryCategory, 'CASE')
assert.deepEqual(result.payload.compatibleModels, ['iPhone 17 Pro Max', 'iPhone 17 Pro'])
result = await call('/api/products', 'PATCH', { id: productId, accessoryCategory: null })
assert.equal(result.payload.accessoryCategory, null)

console.log('product-images.mjs: ok')
