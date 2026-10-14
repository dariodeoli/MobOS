import assert from 'node:assert/strict'
import { hasImageMagicBytes, imageDimensions, primaryImageFields, productImageUrls, readProductImage, MAX_PRODUCT_IMAGE_BYTES } from '../lib/product-images'
import { parseAccessoryCategory, parseCompatibleModels } from '../lib/product-accessories'

// #404: fotos de producto — validación por magic bytes + dimensiones del archivo.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const webp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')
// JPEG mínimo: SOI + APP0 + SOF0 (alto 2, ancho 3) + EOI.
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc00011080002000301011100ffd9', 'hex')

assert.ok(hasImageMagicBytes(png, 'image/png') && !hasImageMagicBytes(png, 'image/jpeg'))
assert.ok(hasImageMagicBytes(webp, 'image/webp') && hasImageMagicBytes(jpeg, 'image/jpeg'))
assert.deepEqual(imageDimensions(png, 'image/png'), { width: 1, height: 1 })
assert.deepEqual(imageDimensions(webp, 'image/webp'), { width: 1, height: 1 })
assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 3, height: 2 })

const file = (bytes: Uint8Array, type: string, name = 'f') => new File([bytes], name, { type })
async function rejects(value: File | null | string, status: number, options?: Parameters<typeof readProductImage>[1]) {
  await assert.rejects(() => readProductImage(value, options), (error: any) => error.status === status)
}

async function main() {
  const ok = await readProductImage(file(png, 'image/png'))
  assert.equal(ok.width, 1)
  assert.equal(ok.extension, 'png')
  assert.match(ok.sha256, /^[0-9a-f]{64}$/)
  await rejects(null, 400)
  await rejects('texto', 400)
  await rejects(file(new Uint8Array(0), 'image/png'), 400)
  await rejects(file(Buffer.from('<svg/>'), 'image/svg+xml'), 415) // tipo no permitido
  await rejects(file(Buffer.from('GIF89a....'), 'image/gif'), 415)
  await rejects(file(png, 'image/jpeg'), 415) // MIME declarado distinto del contenido
  await rejects(file(Buffer.from('no es una imagen'), 'image/png'), 415)
  await rejects(file(new Uint8Array(MAX_PRODUCT_IMAGE_BYTES + 1), 'image/png'), 413) // más de 5 MiB
  await rejects(file(new Uint8Array(300 * 1024), 'image/webp'), 413, { maxBytes: 256 * 1024 }) // miniatura grande
  // PNG con firma válida pero sin IHDR legible: no hay dimensiones.
  await rejects(file(Buffer.concat([png.subarray(0, 8), Buffer.alloc(20)]), 'image/png'), 400)

  // URLs y foto principal del listado.
  assert.deepEqual(productImageUrls('p 1', 'i1'), { url: '/api/products/p%201/images/i1', thumbUrl: '/api/products/p%201/images/i1?size=thumb' })
  assert.deepEqual(primaryImageFields('p1', []), { imageUrl: null, thumbUrl: null })
  assert.deepEqual(primaryImageFields('p1', undefined), { imageUrl: null, thumbUrl: null })
  assert.equal(primaryImageFields('p1', [{ id: 'i9' }]).thumbUrl, '/api/products/p1/images/i9?size=thumb')

  // Categorías y modelos compatibles.
  assert.equal(parseAccessoryCategory(undefined), undefined)
  assert.equal(parseAccessoryCategory(''), null)
  assert.equal(parseAccessoryCategory('lamina'), 'LAMINA')
  assert.throws(() => parseAccessoryCategory('MAGIA'), /inválida/)
  assert.deepEqual(parseCompatibleModels('iPhone 17 Pro, iphone 17 pro ;  iPhone 16'), ['iPhone 17 Pro', 'iPhone 16'])
  assert.deepEqual(parseCompatibleModels([' A ', '', 'a', 3]), ['A'])
  assert.equal(parseCompatibleModels(undefined), undefined)
  assert.deepEqual(parseCompatibleModels(null), [])
  assert.throws(() => parseCompatibleModels(Array.from({ length: 21 }, (_, i) => `M${i}`)), /hasta 20/)
  assert.throws(() => parseCompatibleModels(5), /lista/)
  console.log('product-images.test.ts: ok')
}
main().catch(error => { console.error(error); process.exit(1) })
