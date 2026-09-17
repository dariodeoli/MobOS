import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { MAX_MULTIPART_BODY_BYTES, readProofFile } from '../../../payments/_lib'

const ROLES = ['ADMIN', 'GERENTE']

async function accessibleUnit(id: string, session: { user: { id: string; tenantId: string; role: string; branchId: string | null } }) {
  if (!ROLES.includes(session.user.role)) return null
  const unit = await prisma.inventoryUnit.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, branchId: true, serial: true } })
  if (!unit) return null
  if (session.user.role === 'GERENTE' && unit.branchId !== session.user.branchId) return null
  return unit
}

const authorSelect = { select: { id: true, name: true } }
const photoSelect = { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } }

// Comentarios internos de la unidad con sus fotos (metadatos; los bytes se
// descargan por la ruta de la foto).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const unit = await accessibleUnit(id, session)
  if (!unit) return error('Unidad no encontrada.', 404)
  const comments = await prisma.inventoryUnitComment.findMany({
    where: { tenantId: session.user.tenantId, unitId: unit.id },
    include: { user: authorSelect, photos: photoSelect },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return json(comments)
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const unit = await accessibleUnit(id, session)
  if (!unit) return error('Unidad no encontrada.', 404)
  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return error('El adjunto supera el límite de 5 MiB.', 413)
  let body = ''; let file: Awaited<ReturnType<typeof readProofFile>> | null = null
  try {
    const form = await request.formData()
    const rawBody = form.get('body')
    body = typeof rawBody === 'string' ? rawBody.trim().slice(0, 2000) : ''
    const rawFile = form.get('file')
    if (rawFile && typeof rawFile !== 'string') file = await readProofFile(rawFile)
  } catch (cause) {
    if (cause instanceof Error && 'status' in cause) return error(cause.message, (cause as { status: 400 | 413 | 415 }).status)
    return error('No se pudo leer el comentario.', 400)
  }
  if (!body && !file) return error('Escribí un comentario o adjuntá una foto.', 400)
  const created = await prisma.$transaction(async tx => {
    const comment = await tx.inventoryUnitComment.create({
      data: {
        tenantId: session.user.tenantId, unitId: unit.id, userId: session.user.id, body: body || 'Adjunto',
        ...(file ? { photos: { create: { tenantId: session.user.tenantId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256, data: file.data } } } : {}),
      },
      include: { user: authorSelect, photos: photoSelect },
    })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'INVENTORY_UNIT_COMMENTED', entity: 'InventoryUnit', entityId: unit.id, metadata: { commentId: comment.id, serial: unit.serial, hasPhoto: Boolean(file) } } })
    return comment
  })
  return json(created, { status: 201 })
}
