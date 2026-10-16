import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../../lib/auth'
import { readAttachment } from '../../../../../../lib/attachment-storage'
import { sucursalEfectiva } from '../../../../../../lib/sucursal-efectiva'

type RouteContext = { params: Promise<{ id?: string; imageId?: string }> }

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Bytes de una foto (?size=thumb para la miniatura). El id es inmutable, así que
// el navegador puede guardarla un año; borrar la oculta y el id pasa a 404.
export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const productId = (params.id || '').trim().slice(0, 128)
  const imageId = (params.imageId || '').trim().slice(0, 128)
  if (!productId || !imageId) return error('Foto no encontrada.', 404)
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId, tenantId: session.user.tenantId, deletedAt: null } })
  if (!image) return error('Foto no encontrada.', 404)
  const wantsThumb = new URL(request.url).searchParams.get('size') === 'thumb'
  const useThumb = wantsThumb && Boolean(image.thumbPath || image.thumbData)
  const etag = `"${image.id}${useThumb ? '-t' : ''}"`
  const headers = { ETag: etag, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const bytes = await readAttachment(useThumb
    ? { storageKey: image.thumbPath, data: image.thumbData ?? image.data ?? new Uint8Array() }
    : { storageKey: image.storagePath, data: image.data ?? new Uint8Array() })
  if (!bytes.byteLength) return error('Foto no encontrada.', 404)
  // Nuevas miniaturas servidor WebP; los archivos históricos mantienen su tipo.
  const contentType = useThumb ? 'image/webp' : image.contentType
  return new Response(bytes, { headers: { ...headers, 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength), 'Content-Disposition': `inline; filename="foto.${EXTENSION[contentType] || 'webp'}"` } })
}

// Borrar = ocultar (deletedAt). Si era la principal, la primera que queda lo pasa a ser.
export async function DELETE(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const productId = (params.id || '').trim().slice(0, 128)
  const imageId = (params.imageId || '').trim().slice(0, 128)
  const product = productId ? await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, branchId: true } }) : null
  if (!product) return error('Producto no encontrado.', 404)
  const userBranchId = session.user.branchId ?? (await sucursalEfectiva(session))
  if ((userBranchId === null && product.branchId !== null) || (userBranchId && product.branchId !== null && product.branchId !== userBranchId)) return error('No autorizado para esa sucursal.', 403)
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId, tenantId, deletedAt: null }, select: { id: true, isPrimary: true } })
  if (!image) return error('Foto no encontrada.', 404)
  await prisma.$transaction(async tx => {
    await tx.productImage.update({ where: { id: image.id }, data: { deletedAt: new Date(), isPrimary: false } })
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({ where: { tenantId, productId, deletedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
      if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRODUCT_IMAGE_REMOVED', entity: 'Product', entityId: productId, metadata: { imageId: image.id } } })
  })
  return json({ id: image.id, deleted: true })
}
