import { createHash } from 'node:crypto'

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
  public readonly status: 400 | 413 | 415
  constructor(status: 400 | 413 | 415, message: string) {
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
