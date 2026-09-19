import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { deleteAttachment, saveAttachment } from '../../../lib/attachment-storage'
import { attachmentMetadata, checkAttachmentTarget, isAttachmentEntity, type AttachmentEntity } from '../../../lib/attachments'
import { MAX_MULTIPART_BODY_BYTES, readProofFile } from '../payments/_lib'

// Adjuntos genéricos: cualquier módulo sube archivos contra su documento dueño
// (entity + entityId) reutilizando el almacenamiento de comprobantes. La
// visibilidad la decide checkAttachmentTarget, que replica la del módulo dueño.

const SELECT = { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, createdBy: { select: { id: true, name: true } } } as const

function entityParam(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return isAttachmentEntity(raw) ? raw : null
}

function idParam(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw && raw.length <= 128 ? raw : null
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const entity = entityParam(params.get('entity'))
  const entityId = idParam(params.get('entityId'))
  if (!entity || !entityId) return error('Entidad y documento son obligatorios.')

  const check = await checkAttachmentTarget(entity, entityId, session)
  if (!check.ok) return error(check.status === 404 ? 'Documento no encontrado.' : 'No autorizado.', check.status)

  const attachments = await prisma.attachment.findMany({
    where: { tenantId: session.user.tenantId, entity, entityId },
    select: SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return json(attachments.map(attachmentMetadata))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return error('El adjunto supera el límite de 5 MiB.', 413)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return error('No se pudo leer el adjunto.', 400)
  }

  const entity = entityParam(form.get('entity'))
  const entityId = idParam(form.get('entityId'))
  if (!entity || !entityId) return error('Entidad y documento son obligatorios.')

  const check = await checkAttachmentTarget(entity, entityId, session)
  if (!check.ok) return error(check.status === 404 ? 'Documento no encontrado.' : 'No autorizado.', check.status)

  let file: Awaited<ReturnType<typeof readProofFile>>
  try {
    file = await readProofFile(form.get('file'))
  } catch (cause) {
    if (cause instanceof Error && 'status' in cause) return error(cause.message, (cause as { status: 400 | 413 | 415 }).status)
    return error('No se pudo leer el adjunto.', 400)
  }

  // Tombstone: si esos mismos bytes ya se eliminaron de este documento, no
  // vuelven solos (reintentos o sincronización externa). Una copia distinta
  // (otro hash) se puede subir normalmente.
  const tumba = await prisma.attachmentTombstone.findUnique({
    where: { tenantId_entity_entityId_sha256: { tenantId: session.user.tenantId, entity, entityId, sha256: file.sha256 } },
    select: { id: true },
  })
  if (tumba) return error('Ese archivo ya fue eliminado de este documento. Si lo necesitás de nuevo, subilo como una copia nueva.', 409)

  // Write-through: si hay volumen configurado se guarda el archivo y en la
  // base queda el storageKey; `data` se conserva como respaldo del adjunto.
  const stored = await saveAttachment({ tenantId: session.user.tenantId, area: 'attachments', fileName: file.fileName, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
  const created = await prisma.$transaction(async tx => {
    const attachment = await tx.attachment.create({
      data: {
        tenantId: session.user.tenantId,
        entity,
        entityId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        storageKey: stored.storageKey,
        data: file.data,
        createdById: session.user.id,
      },
      select: SELECT,
    })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ATTACHMENT_CREATED', entity: 'Attachment', entityId: attachment.id, metadata: { entity, entityId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 } } })
    return attachment
  })
  return json(attachmentMetadata(created), { status: 201 })
}

export async function DELETE(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = idParam(new URL(request.url).searchParams.get('id'))
  if (!id) return error('Adjunto obligatorio.')

  const attachment = await prisma.attachment.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, entity: true, entityId: true, sha256: true, storageKey: true } })
  if (!attachment || !isAttachmentEntity(attachment.entity)) return error('Adjunto no encontrado.', 404)

  const check = await checkAttachmentTarget(attachment.entity as AttachmentEntity, attachment.entityId, session)
  if (!check.ok) return error(check.status === 404 ? 'Documento no encontrado.' : 'No autorizado.', check.status)

  await prisma.$transaction(async tx => {
    await tx.attachment.delete({ where: { id: attachment.id } })
    await tx.attachmentTombstone.upsert({
      where: { tenantId_entity_entityId_sha256: { tenantId: session.user.tenantId, entity: attachment.entity, entityId: attachment.entityId, sha256: attachment.sha256 } },
      create: { tenantId: session.user.tenantId, entity: attachment.entity, entityId: attachment.entityId, sha256: attachment.sha256, deletedBy: session.user.id },
      update: { deletedAt: new Date(), deletedBy: session.user.id },
    })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'ATTACHMENT_DELETED', entity: 'Attachment', entityId: attachment.id, metadata: { entity: attachment.entity, entityId: attachment.entityId, sha256: attachment.sha256 } } })
  })
  await deleteAttachment(attachment)
  return json({ id: attachment.id, deleted: true })
}
