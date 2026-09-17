import { NextResponse } from 'next/server'
import { error } from '../../../../../../../../lib/http'
import { requireSession } from '../../../../../../../../lib/auth'
import { prisma } from '../../../../../../../../lib/prisma'
import { canAccessOrder } from '../../../../../../../../lib/orders'
import { safeDownloadName } from '../../../../../../../../app/api/payments/_lib'

type RouteContext = { params: Promise<{ orderId: string; commentId: string; photoId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { orderId, commentId, photoId } = await context.params
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: session.user.tenantId }, select: { id: true, sellerId: true, branchId: true } })
  if (!order || !canAccessOrder(session.user, order)) return error('Foto no encontrada.', 404)
  const photo = await prisma.$transaction(async tx => {
    const found = await tx.orderCommentPhoto.findFirst({
      where: { id: photoId, commentId, tenantId: session.user.tenantId, comment: { orderId: order.id } },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, data: true },
    })
    if (!found) return null
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ORDER_COMMENT_PHOTO_DOWNLOADED', entity: 'OrderCommentPhoto', entityId: found.id, metadata: { orderId: order.id, sizeBytes: found.sizeBytes } } })
    return found
  })
  if (!photo) return error('Foto no encontrada.', 404)
  return new NextResponse(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      'Content-Type': photo.mimeType,
      'Content-Length': String(photo.sizeBytes),
      'Content-Disposition': `attachment; filename="${safeDownloadName(photo.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
