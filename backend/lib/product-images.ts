import { createHash } from 'node:crypto'
import sharp from 'sharp'

// #404: validación de fotos de producto. Mismos tipos y tope que los adjuntos
// (JPG/PNG/WebP, 5 MiB, magic bytes); además se leen las dimensiones del propio
// archivo para no confiar en lo que declare el cliente.
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_PRODUCT_THUMB_BYTES = 256 * 1024
export const MAX_PRODUCT_IMAGES = 12
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_IMAGE_SIDE = 8000
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export class ProductImageError extends Error {
  public readonly status: 400 | 413 | 415 | 429
  constructor(status: 400 | 413 | 415 | 429, message: string) {
    super(message)
    this.status = status
  }
}

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.slice(from, to))
}

export function hasImageMagicBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  if (mimeType === 'image/webp') return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP'
  return false
}

/** Ancho y alto leídos del encabezado; null si el archivo no los declara bien. */
export function imageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 16) !== 'IHDR') return null
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mimeType === 'image/webp') {
    if (bytes.length < 30) return null
    const chunk = ascii(bytes, 12, 16)
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1, height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1 }
    return null
  }
  if (mimeType === 'image/jpeg') {
    const startOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      if (marker === 0xff) { offset += 1; continue }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue }
      const length = view.getUint16(offset + 2)
      if (startOfFrame.includes(marker)) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      if (length < 2) return null
      offset += 2 + length
    }
  }
  return null
}

export type ValidatedImage = { data: Uint8Array<ArrayBuffer>; mimeType: string; sizeBytes: number; width: number; height: number; sha256: string; extension: string }

const mib = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 100) / 100} MiB`

/** Valida un archivo de foto: MIME permitido, tamaño, magic bytes y dimensiones. */
export async function readProductImage(value: FormDataEntryValue | null, { maxBytes = MAX_PRODUCT_IMAGE_BYTES, label = 'La foto' }: { maxBytes?: number; label?: string } = {}): Promise<ValidatedImage> {
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') throw new ProductImageError(400, `${label} es obligatoria.`)
  const mimeType = value.type.trim().toLowerCase()
  if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) throw new ProductImageError(415, 'Tipo de archivo no permitido. Use JPG, PNG o WEBP.')
  if (!Number.isFinite(value.size) || value.size <= 0) throw new ProductImageError(400, `${label} no puede estar vacía.`)
  if (value.size > maxBytes) throw new ProductImageError(413, `${label} supera el límite de ${mib(maxBytes)}.`)
  const bytes = new Uint8Array(await value.arrayBuffer())
  if (!bytes.byteLength) throw new ProductImageError(400, `${label} no puede estar vacía.`)
  if (bytes.byteLength > maxBytes) throw new ProductImageError(413, `${label} supera el límite de ${mib(maxBytes)}.`)
  if (!hasImageMagicBytes(bytes, mimeType)) throw new ProductImageError(415, 'El contenido del archivo no coincide con su MIME declarado.')
  const size = imageDimensions(bytes, mimeType)
  if (!size || size.width < 1 || size.height < 1 || size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) throw new ProductImageError(400, 'No se pudo leer el tamaño de la imagen o es demasiado grande.')
  return { data: bytes, mimeType, sizeBytes: bytes.byteLength, width: size.width, height: size.height, sha256: createHash('sha256').update(bytes).digest('hex'), extension: EXTENSION[mimeType] }
}

/**
 * Decodifica una foto recibida por una integración (por ejemplo MCP) y la
 * somete exactamente a la misma validación que el multipart web. El MIME,
 * las dimensiones y el tamaño se obtienen del contenido; nunca se confía en
 * metadatos enviados por el cliente.
 */
export async function readProductImageBase64(dataBase64: unknown, mimeType: unknown, options: { maxBytes?: number; label?: string } = {}): Promise<ValidatedImage> {
  if (typeof dataBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0) throw new ProductImageError(400, `${options.label || 'La foto'} tiene datos Base64 inválidos.`)
  const bytes = Buffer.from(dataBase64, 'base64')
  if (!bytes.length || bytes.toString('base64') !== dataBase64) throw new ProductImageError(400, `${options.label || 'La foto'} tiene datos Base64 inválidos.`)
  const declaredMime = typeof mimeType === 'string' ? mimeType : ''
  return readProductImage(new File([bytes], 'mcp-image', { type: declaredMime }), options)
}

/** Cota real del multipart aun sin Content-Length o con cabecera falsa. */
export async function readProductImageFormData(request: Request, maxBytes: number): Promise<FormData> {
  const reader = request.body?.getReader()
  if (!reader) throw new ProductImageError(400, 'No se pudo leer la foto.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new ProductImageError(413, 'La foto supera el límite de 5 MiB.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
  } finally {
    reader.releaseLock()
  }
}

// Límites por proceso: no se encolan decodificaciones sin cota ni se libera
// un cupo por un timer JS mientras libvips todavía trabaja.
export const MAX_PRODUCT_IMAGE_PIXELS = 16_000_000
const MAX_CONVERSIONS = 2
let conversions = 0

function derivative(data: Uint8Array<ArrayBuffer>, width: number, height: number): ValidatedImage {
  return { data, width, height, mimeType: 'image/webp', extension: 'webp', sizeBytes: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') }
}

function animatedHeader(input: ValidatedImage) {
  if (input.mimeType === 'image/webp') return ascii(input.data, 12, 16) === 'VP8X' && Boolean(input.data[20] & 0x02)
  if (input.mimeType !== 'image/png') return false
  const view = new DataView(input.data.buffer, input.data.byteOffset, input.data.byteLength)
  for (let offset = 8; offset + 12 <= input.data.length;) {
    const length = view.getUint32(offset)
    if (ascii(input.data, offset + 4, offset + 8) === 'acTL') return true
    if (length > input.data.length - offset - 12) break
    offset += length + 12
  }
  return false
}

/** Sólo los derivados decodificados se persisten; nunca EXIF ni bytes originales. */
export async function generateProductImages(value: FormDataEntryValue | null): Promise<{ image: ValidatedImage; thumb: ValidatedImage }> {
  const input = await readProductImage(value)
  if (animatedHeader(input)) throw new ProductImageError(400, 'La foto debe ser una imagen estática.')
  if (input.width * input.height > MAX_PRODUCT_IMAGE_PIXELS) throw new ProductImageError(400, 'La foto supera los 16 megapíxeles. Recórtela o reduzca su resolución.')
  if (conversions >= MAX_CONVERSIONS) throw new ProductImageError(429, 'Se están procesando otras fotos. Intente de nuevo en unos segundos.')
  conversions += 1
  try {
    const pipeline = sharp(input.data, { failOn: 'warning', limitInputPixels: MAX_PRODUCT_IMAGE_PIXELS, limitInputChannels: 4, sequentialRead: true })
    const metadata = await pipeline.metadata()
    if (metadata.format !== ({ 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' } as Record<string, string>)[input.mimeType]
      || !metadata.width || !metadata.height || metadata.width > MAX_IMAGE_SIDE || metadata.height > MAX_IMAGE_SIDE
      || metadata.width * metadata.height > MAX_PRODUCT_IMAGE_PIXELS || (metadata.pages ?? 1) !== 1) {
      throw new ProductImageError(400, 'La foto debe ser una imagen estática de hasta 16 megapíxeles.')
    }
    // timeout() es nativo de sharp/libvips; await espera su finalización real.
    const main = await pipeline.rotate().resize(800, 800, { fit: 'cover', position: 'centre' }).webp({ quality: 82, effort: 3 }).timeout({ seconds: 3 }).toBuffer({ resolveWithObject: true })
    const small = await sharp(main.data, { failOn: 'warning', limitInputPixels: 800 * 800 }).resize(160, 160).webp({ quality: 78, effort: 3 }).timeout({ seconds: 3 }).toBuffer({ resolveWithObject: true })
    if (main.data.length > MAX_PRODUCT_IMAGE_BYTES || small.data.length > MAX_PRODUCT_THUMB_BYTES) throw new ProductImageError(413, 'La foto procesada supera el tamaño permitido.')
    return { image: derivative(new Uint8Array(main.data), main.info.width, main.info.height), thumb: derivative(new Uint8Array(small.data), small.info.width, small.info.height) }
  } catch (cause) {
    if (cause instanceof ProductImageError) throw cause
    throw new ProductImageError(400, 'No se pudo decodificar la foto. Use una imagen JPG, PNG o WEBP estática y completa.')
  } finally {
    conversions -= 1
  }
}

/** Genera los derivados canónicos para una integración sin abrir otro camino de validación. */
export async function generateProductImagesBase64(dataBase64: unknown, mimeType: unknown): Promise<{ image: ValidatedImage; thumb: ValidatedImage }> {
  const input = await readProductImageBase64(dataBase64, mimeType)
  return generateProductImages(new File([input.data], 'mcp-image', { type: input.mimeType }))
}

/** URLs relativas de la API; el cliente las baja con sesión y las cachea. */
export function productImageUrls(productId: string, imageId: string) {
  const base = `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`
  return { url: base, thumbUrl: `${base}?size=thumb` }
}

type ImageRow = { id: string; position: number; isPrimary: boolean; variantKey?: string | null; width: number; height: number; contentType: string; sizeBytes: number; createdAt: Date }

export function serializeProductImage(productId: string, row: ImageRow) {
  return { id: row.id, position: row.position, isPrimary: row.isPrimary, variantKey: row.variantKey ?? null, width: row.width, height: row.height, contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt, ...productImageUrls(productId, row.id) }
}

/** Campos de imagen principal que se suman a cada producto del listado. */
export function primaryImageFields(productId: string, images: Array<{ id: string }> | undefined | null) {
  const first = images?.[0]
  if (!first) return { imageUrl: null, thumbUrl: null }
  const { url, thumbUrl } = productImageUrls(productId, first.id)
  return { imageUrl: url, thumbUrl }
}

/** Include de Prisma: solo la imagen principal activa (o la primera si no hay marcada). */
export const PRIMARY_IMAGE_INCLUDE = {
  where: { deletedAt: null },
  orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }, { createdAt: 'asc' as const }],
  take: 1,
  select: { id: true },
}
