import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../lib/auth'
import { deleteAttachment, saveAttachment } from '../../../../../lib/attachment-storage'
import { sucursalEfectiva } from '../../../../../lib/sucursal-efectiva'
import { MAX_PRODUCT_IMAGES, MAX_PRODUCT_THUMB_BYTES, ProductImageError, generateProductImages, readProductImage, readProductImageFormData, serializeProductImage } from '../../../../../lib/product-images'
import { MAX_MULTIPART_BODY_BYTES } from '../../../payments/_lib'

type RouteContext = { params: Promise<{ id?: string }> }

// #404: fotos de producto. Todo se filtra por empresa; un producto de otra
// empresa responde 404. Subir, reordenar y marcar principal exigen stock:manage.

const AREA = 'product-images'
const SELECT = { id: true, position: true, isPrimary: true, variantKey: true, width: true, height: true, contentType: true, sizeBytes: true, createdAt: true } as const
const ORDER = [{ isPrimary: 'desc' as const }, { position: 'asc' as const }, { createdAt: 'asc' as const }]

async function productoDeLaEmpresa(productId: string, tenantId: string) {
  return prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, branchId: true } })
}

/** Misma regla de sucursal que PATCH /api/products. */
async function sucursalPermitida(session: Parameters<typeof sucursalEfectiva>[0], product: { branchId: string | null }) {
  const userBranchId = session.user.branchId ?? (await sucursalEfectiva(session))
  if ((userBranchId === null && product.branchId !== null) || (userBranchId && product.branchId !== null && product.branchId !== userBranchId)) return false
  return true
}

export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const productId = (params.id || '').trim().slice(0, 128)
  if (!productId || !(await productoDeLaEmpresa(productId, session.user.tenantId))) return error('Producto no encontrado.', 404)
  const images = await prisma.productImage.findMany({ where: { tenantId: session.user.tenantId, productId, deletedAt: null }, select: SELECT, orderBy: ORDER })
  return json(images.map(image => serializeProductImage(productId, image)))
}

export async function POST(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const productId = (params.id || '').trim().slice(0, 128)
  const product = productId ? await productoDeLaEmpresa(productId, tenantId) : null
  if (!product) return error('Producto no encontrado.', 404)
  if (!(await sucursalPermitida(session, product))) return error('No autorizado para esa sucursal.', 403)

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES + MAX_PRODUCT_THUMB_BYTES) return error('La foto supera el límite de 5 MiB.', 413)
  let form: FormData
  try { form = await readProductImageFormData(request, MAX_MULTIPART_BODY_BYTES + MAX_PRODUCT_THUMB_BYTES) } catch (cause) {
    if (cause instanceof ProductImageError) return error(cause.message, cause.status)
    return error('No se pudo leer la foto.', 400)
  }

  let image: Awaited<ReturnType<typeof readProductImage>>
  let thumb: Awaited<ReturnType<typeof readProductImage>> | null = null
  try {
    const rawThumb = form.get('thumb')
    // Compatibilidad: validar el campo opcional, pero nunca usar sus píxeles.
    if (rawThumb) {
      const suppliedThumb = await readProductImage(rawThumb, { maxBytes: MAX_PRODUCT_THUMB_BYTES, label: 'La miniatura' })
      if (suppliedThumb.mimeType !== 'image/webp') throw new ProductImageError(415, 'La miniatura debe ser WEBP.')
    }
    ;({ image, thumb } = await generateProductImages(form.get('file')))
  } catch (cause) {
    if (cause instanceof ProductImageError) return error(cause.message, cause.status)
    console.error('[product-images] no se pudo leer la foto', cause)
    return error('No se pudo leer la foto.', 400)
  }
  const variantKey = typeof form.get('variantKey') === 'string' && String(form.get('variantKey')).trim() ? String(form.get('variantKey')).trim().slice(0, 120) : null

  const activas = await prisma.productImage.count({ where: { tenantId, productId, deletedAt: null } })
  if (activas >= MAX_PRODUCT_IMAGES) return error(`Un producto admite hasta ${MAX_PRODUCT_IMAGES} fotos.`, 409)

  let stored: { storageKey: string | null } = { storageKey: null }
  let storedThumb: { storageKey: string | null } = { storageKey: null }
  try {
    stored = await saveAttachment({ tenantId, area: AREA, fileName: `foto.${image.extension}`, mimeType: image.mimeType, sha256: image.sha256, data: image.data })
    storedThumb = thumb ? await saveAttachment({ tenantId, area: AREA, fileName: `mini.${thumb.extension}`, mimeType: thumb.mimeType, sha256: thumb.sha256, data: thumb.data }) : { storageKey: null }
    const created = await prisma.$transaction(async tx => {
      const last = await tx.productImage.findFirst({ where: { tenantId, productId, deletedAt: null }, orderBy: { position: 'desc' }, select: { position: true } })
      const hasPrimary = (await tx.productImage.count({ where: { tenantId, productId, deletedAt: null, isPrimary: true } })) > 0
      const row = await tx.productImage.create({
        data: {
          tenantId, productId, variantKey,
          position: last ? last.position + 1 : 0,
          isPrimary: !hasPrimary,
          storagePath: stored.storageKey, thumbPath: storedThumb.storageKey,
          // Sin volumen configurado los bytes quedan en la base (como los adjuntos).
          data: stored.storageKey ? null : image.data,
          thumbData: thumb && !storedThumb.storageKey ? thumb.data : null,
          width: image.width, height: image.height, contentType: image.mimeType, sizeBytes: image.sizeBytes,
          createdById: session.user.id,
        },
        select: SELECT,
      })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRODUCT_IMAGE_ADDED', entity: 'Product', entityId: productId, metadata: { imageId: row.id, contentType: image.mimeType, sizeBytes: image.sizeBytes, sha256: image.sha256 } } })
      return row
    })
    return json(serializeProductImage(productId, created), { status: 201 })
  } catch (cause) {
    console.error('[product-images] no se pudo guardar la foto', cause)
    await deleteAttachment({ storageKey: stored.storageKey })
    await deleteAttachment({ storageKey: storedThumb.storageKey })
    return error('No se pudo guardar la foto.', 500)
  }
}

// PATCH { action: 'reorder', order: [id…] } | { action: 'primary', imageId }
export async function PATCH(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const productId = (params.id || '').trim().slice(0, 128)
  const product = productId ? await productoDeLaEmpresa(productId, tenantId) : null
  if (!product) return error('Producto no encontrado.', 404)
  if (!(await sucursalPermitida(session, product))) return error('No autorizado para esa sucursal.', 403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return error('Cuerpo inválido.')

  const activas = await prisma.productImage.findMany({ where: { tenantId, productId, deletedAt: null }, select: { id: true, position: true, isPrimary: true }, orderBy: ORDER })
  const ids = new Set(activas.map(image => image.id))

  if (body.action === 'reorder') {
    const order: unknown = body.order
    if (!Array.isArray(order) || order.some(id => typeof id !== 'string') || new Set(order).size !== order.length || order.length !== ids.size || order.some(id => !ids.has(id))) return error('El orden debe incluir exactamente las fotos activas del producto.')
    await prisma.$transaction(async tx => {
      for (const [position, id] of (order as string[]).entries()) await tx.productImage.updateMany({ where: { id, tenantId, productId, deletedAt: null }, data: { position } })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRODUCT_IMAGES_REORDERED', entity: 'Product', entityId: productId, metadata: { order } } })
    })
  } else if (body.action === 'primary') {
    if (typeof body.imageId !== 'string' || !ids.has(body.imageId)) return error('Foto no encontrada.', 404)
    await prisma.$transaction(async tx => {
      await tx.productImage.updateMany({ where: { tenantId, productId, deletedAt: null, isPrimary: true }, data: { isPrimary: false } })
      await tx.productImage.updateMany({ where: { id: body.imageId, tenantId, productId, deletedAt: null }, data: { isPrimary: true } })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRODUCT_IMAGE_PRIMARY', entity: 'Product', entityId: productId, metadata: { imageId: body.imageId } } })
    })
  } else {
    return error('Acción inválida.')
  }
  const images = await prisma.productImage.findMany({ where: { tenantId, productId, deletedAt: null }, select: SELECT, orderBy: ORDER })
  return json(images.map(image => serializeProductImage(productId, image)))
}
