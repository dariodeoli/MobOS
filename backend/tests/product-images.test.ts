import assert from 'node:assert/strict'
import sharp from 'sharp'
import { hasImageMagicBytes, imageDimensions, primaryImageFields, productImageUrls, readProductImage, readProductImageBase64, MAX_PRODUCT_IMAGE_BYTES, generateProductImages, generateProductImagesBase64, readProductImageFormData } from '../lib/product-images'
import { accessoryCatalogFilter, parseAccessoryCategory, parseCompatibleModels } from '../lib/product-accessories'

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

const file = (bytes: Uint8Array, type: string, name = 'f') => new File([bytes as BlobPart], name, { type })
async function rejects(value: File | null | string, status: number, options?: Parameters<typeof readProductImage>[1]) {
  await assert.rejects(() => readProductImage(value, options), (error: unknown) => error instanceof Error && 'status' in error && error.status === status)
}
const statusIs = (status: number) => (error: unknown) => error instanceof Error && 'status' in error && error.status === status

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
  await assert.rejects(() => readProductImageBase64('no-es-base64', 'image/png'), statusIs(400))
  await assert.rejects(() => readProductImageBase64(Buffer.from(png).toString('base64'), 'image/jpeg'), statusIs(415))

  // #404: el servidor decodifica y deriva AMBAS imágenes del mismo file.
  const source = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#de3456' } }).png().toBuffer()
  const generated = await generateProductImages(file(source, 'image/png'))
  assert.equal(generated.image.width, 800)
  assert.equal(generated.image.height, 800)
  assert.equal(generated.image.mimeType, 'image/webp')
  assert.equal(generated.thumb.width, 160)
  assert.equal(generated.thumb.height, 160)
  assert.equal(generated.thumb.mimeType, 'image/webp')
  const throughMcp = await generateProductImagesBase64(source.toString('base64'), 'image/png')
  assert.deepEqual([throughMcp.image.width, throughMcp.image.height, throughMcp.thumb.width, throughMcp.thumb.height], [800, 800, 160, 160])
  for (const output of [generated.image, generated.thumb]) {
    const metadata = await sharp(output.data).metadata()
    assert.equal(metadata.width, output.width)
    assert.equal(metadata.height, output.height)
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
    assert.equal(output.sizeBytes, output.data.byteLength)
    assert.match(output.sha256, /^[0-9a-f]{64}$/)
  }
  // Firma/cabecera sola no prueban que haya píxeles decodificables.
  await assert.rejects(() => generateProductImages(file(source.subarray(0, 33), 'image/png')), statusIs(400))
  const bomb = Buffer.from(source); bomb.writeUInt32BE(8000, 16); bomb.writeUInt32BE(8000, 20)
  await assert.rejects(() => generateProductImages(file(bomb, 'image/png')), statusIs(400))
  const apng = Buffer.concat([source.subarray(0,33),Buffer.from('000000086163544c000000020000000000000000','hex'),source.subarray(33)])
  await assert.rejects(() => generateProductImages(file(apng,'image/png')), statusIs(400))
  const withExif = await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const oriented = await generateProductImages(file(withExif, 'image/jpeg'))
  assert.equal((await sharp(oriented.image.data).metadata()).orientation, undefined)
  const tinyWebp = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#14ad56' } }).webp().toBuffer()
  const tiny = await generateProductImages(file(tinyWebp, 'image/webp'))
  assert.deepEqual([tiny.image.width,tiny.image.height,tiny.thumb.width,tiny.thumb.height], [800,800,160,160])

  const animated = await sharp(Buffer.from([...Array(12).fill(0), ...Array(12).fill(255)]), { raw: { width:2, height:4, channels:3, pageHeight:2 } }).webp({loop:0,delay:[100,100]}).toBuffer()
  assert.equal((await sharp(animated).metadata()).pages, 2)
  await assert.rejects(() => generateProductImages(file(animated, 'image/webp')), statusIs(400))
  await assert.rejects(() => generateProductImages(file(source, 'image/webp')), statusIs(415))
  const simultaneous = await Promise.allSettled([1,2,3].map(() => generateProductImages(file(source,'image/png'))))
  assert.equal(simultaneous.filter(r => r.status === 'fulfilled').length, 2)
  assert.equal(simultaneous.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 1)
  assert.equal((await generateProductImages(file(source,'image/png'))).thumb.width,160, 'se libera el cupo tras finalizar trabajos reales')

  for (const headers of [{}, { 'content-length':'1' }]) {
    let canceled = false
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(20)) }, cancel() { canceled = true } })
    const request = new Request('http://localhost/upload', { method:'POST', headers, body:stream, duplex:'half' } as RequestInit)
    await assert.rejects(() => readProductImageFormData(request,32), statusIs(413))
    assert.equal(canceled,true,'se cancela el stream al pasar la cota, sin confiar Content-Length')
  }
  const form = new FormData(); form.append('file',file(source,'image/png'));form.append('variantKey','negro')
  const parsed = await readProductImageFormData(new Request('http://localhost/upload',{method:'POST',body:form}),MAX_PRODUCT_IMAGE_BYTES)
  assert.equal(parsed.get('variantKey'),'negro')
  assert.equal((parsed.get('file') as File).size,source.length)

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
  assert.equal(accessoryCatalogFilter(undefined), undefined)
  assert.equal(accessoryCatalogFilter('MAGIA'), undefined)
  assert.deepEqual(accessoryCatalogFilter('otro'), { accessoryCategory: 'OTRO' })
  assert.equal((accessoryCatalogFilter('cable') as any).OR[0].accessoryCategory, 'CABLE')
  console.log('product-images.test.ts: ok')
}
main().catch(error => { console.error(error); process.exit(1) })
