import { NextResponse } from 'next/server'
import { error } from '../../../../../../../../lib/http'
import { requireSession } from '../../../../../../../../lib/auth'
import { prisma } from '../../../../../../../../lib/prisma'
import { safeDownloadName } from '../../../../../../../../app/api/payments/_lib'

type RouteContext = { params: Promise<{ id: string; commentId: string; photoId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const { id, commentId, photoId } = await context.params
  const unit = await prisma.inventoryUnit.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, branchId: true } })
  if (!unit || (session.user.role === 'GERENTE' && unit.branchId !== session.user.branchId)) return error('Foto no encontrada.', 404)
  const photo = await prisma.$transaction(async tx => {
    const found = await tx.inventoryUnitCommentPhoto.findFirst({
      where: { id: photoId, commentId, tenantId: session.user.tenantId, comment: { unitId: unit.id } },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, data: true },
    })
    if (!found) return null
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'INVENTORY_UNIT_COMMENT_PHOTO_DOWNLOADED', entity: 'InventoryUnitCommentPhoto', entityId: found.id, metadata: { unitId: unit.id, sizeBytes: found.sizeBytes } } })
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
