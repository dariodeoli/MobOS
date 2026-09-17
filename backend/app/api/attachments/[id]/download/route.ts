import { NextResponse } from 'next/server'
import { error } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { readAttachment } from '../../../../../lib/attachment-storage'
import { checkAttachmentTarget, isAttachmentEntity, type AttachmentEntity } from '../../../../../lib/attachments'
import { safeDownloadName } from '../../../payments/_lib'

type RouteContext = { params: { id: string } }

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)

  const id = (params.id || '').trim().slice(0, 128)
  const attachment = await prisma.attachment.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, entity: true, entityId: true, fileName: true, mimeType: true, sizeBytes: true, data: true, storageKey: true },
  })
  if (!attachment || !isAttachmentEntity(attachment.entity)) return error('Adjunto no encontrado.', 404)

  const check = await checkAttachmentTarget(attachment.entity as AttachmentEntity, attachment.entityId, session)
  if (!check.ok) return error(check.status === 404 ? 'Documento no encontrado.' : 'No autorizado.', check.status)

  const bytes = await readAttachment(attachment)

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.sizeBytes),
      'Content-Disposition': `attachment; filename="${safeDownloadName(attachment.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
