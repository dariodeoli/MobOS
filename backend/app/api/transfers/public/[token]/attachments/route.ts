import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { readAttachment, saveAttachment } from '../../../../../../lib/attachment-storage'
import { attachmentMetadata } from '../../../../../../lib/attachments'
import { MAX_MULTIPART_BODY_BYTES, readProofFile } from '../../../../payments/_lib'

// Foto del remito desde el enlace público: el token del traslado autoriza
// subir y ver solo los adjuntos de ESE remito. La recepción no tiene sesión,
// así que el adjunto queda con createdById null y auditoría de origen público.
const SELECT = { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, createdBy: { select: { id: true, name: true } } } as const

async function transferPorToken(token: string) {
  if (!token || token.length > 200) return null
  return prisma.stockTransfer.findUnique({ where: { publicToken: token }, select: { id: true, tenantId: true } })
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const transfer = await transferPorToken(token)
  if (!transfer) return error('Remito no encontrado.', 404)

  const id = new URL(request.url).searchParams.get('id')
  if (id) {
    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId: transfer.tenantId, entity: 'STOCK_TRANSFER', entityId: transfer.id } })
    if (!attachment) return error('Adjunto no encontrado.', 404)
    const bytes = await readAttachment(attachment)
    return new Response(bytes, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  const attachments = await prisma.attachment.findMany({
    where: { tenantId: transfer.tenantId, entity: 'STOCK_TRANSFER', entityId: transfer.id },
    select: SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return json(attachments.map(attachmentMetadata))
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'transfers-public-attachments', 20, 60_000)
  if (limited) return limited
  const { token } = await context.params
  const transfer = await transferPorToken(token)
  if (!transfer) return error('Remito no encontrado.', 404)

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return error('El adjunto supera el límite de 5 MiB.', 413)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return error('No se pudo leer el adjunto.', 400)
  }

  let file: Awaited<ReturnType<typeof readProofFile>>
  try {
    file = await readProofFile(form.get('file'))
  } catch (cause) {
    if (cause instanceof Error && 'status' in cause) return error(cause.message, (cause as { status: 400 | 413 | 415 }).status)
    return error('No se pudo leer el adjunto.', 400)
  }

  const stored = await saveAttachment({ tenantId: transfer.tenantId, area: 'attachments', fileName: file.fileName, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
  const created = await prisma.$transaction(async tx => {
    const attachment = await tx.attachment.create({
      data: {
        tenantId: transfer.tenantId,
        entity: 'STOCK_TRANSFER',
        entityId: transfer.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        storageKey: stored.storageKey,
        data: file.data,
        createdById: null,
      },
      select: SELECT,
    })
    await tx.auditLog.create({ data: { tenantId: transfer.tenantId, userId: null, action: 'ATTACHMENT_CREATED', entity: 'Attachment', entityId: attachment.id, metadata: { entity: 'STOCK_TRANSFER', entityId: transfer.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, origin: 'public' } } })
    return attachment
  })
  return json(attachmentMetadata(created), { status: 201 })
}
