import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { saveAttachment } from '../../../../../lib/attachment-storage'
import { MAX_MULTIPART_BODY_BYTES, readProofFile } from '../../../payments/_lib'

type RouteContext = { params: { id: string } }

// Fotos de un caso de garantía. Mismo criterio que los comprobantes de pago:
// multipart, MIME permitido, magic bytes, tamaño máximo y sha256. Con volumen
// configurado se guarda el archivo y en la base quedan los metadatos y el
// storageKey (los bytes en `data` se conservan como respaldo); el listado nunca
// devuelve bytes. Alcance: igual que garantías: cargar es de ADMIN/GERENTE
// (GERENTE solo su sucursal); listar está disponible para todos los roles menos
// VENDEDOR.

async function findWarrantyCase(warrantyCaseId: string, session: { user: { tenantId: string; role: string; branchId: string | null } }) {
  const warrantyCase = await prisma.warrantyCase.findFirst({
    where: {
      id: warrantyCaseId,
      tenantId: session.user.tenantId,
      ...(session.user.role === 'GERENTE' ? { branchId: session.user.branchId ?? '' } : {}),
    },
    select: { id: true, branchId: true },
  })
  if (!warrantyCase) return null
  return warrantyCase
}

function metadata(photo: { id: string; label: string | null; fileName: string; mimeType: string; sizeBytes: number; sha256: string; createdAt: Date }) {
  return { id: photo.id, label: photo.label, fileName: photo.fileName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, sha256: photo.sha256, createdAt: photo.createdAt }
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role === 'VENDEDOR') return error('No autorizado.', 403)
  const warrantyCaseId = (params.id || '').trim().slice(0, 128)
  const warrantyCase = await findWarrantyCase(warrantyCaseId, session)
  if (!warrantyCase) return error('Garantía no encontrada.', 404)

  const photos = await prisma.warrantyPhoto.findMany({
    where: { tenantId: session.user.tenantId, warrantyCaseId: warrantyCase.id },
    select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'WARRANTY_PHOTOS_VIEWED', entity: 'WarrantyCase', entityId: warrantyCase.id, metadata: { count: photos.length } } })
  return json(photos.map(metadata))
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const warrantyCaseId = (params.id || '').trim().slice(0, 128)
  const warrantyCase = await findWarrantyCase(warrantyCaseId, session)
  if (!warrantyCase) return error('Garantía no encontrada.', 404)

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return error('La foto supera el límite de 5 MiB.', 413)

  let file: Awaited<ReturnType<typeof readProofFile>>
  let label: string | null = null
  try {
    const form = await request.formData()
    file = await readProofFile(form.get('file'))
    const rawLabel = form.get('label')
    label = typeof rawLabel === 'string' ? rawLabel.trim().slice(0, 160) || null : null
  } catch (cause) {
    if (cause instanceof Error && 'status' in cause) return error(cause.message, (cause as { status: 400 | 413 | 415 }).status)
    return error('No se pudo leer la foto.', 400)
  }

  try {
    const stored = await saveAttachment({ tenantId: session.user.tenantId, area: 'warranty-photos', fileName: file.fileName, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
    const created = await prisma.$transaction(async tx => {
      const photo = await tx.warrantyPhoto.create({
        data: {
          tenantId: session.user.tenantId,
          warrantyCaseId: warrantyCase.id,
          label: label || null,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          data: file.data,
          storageKey: stored.storageKey,
        },
        select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'WARRANTY_PHOTO_UPLOADED', entity: 'WarrantyPhoto', entityId: photo.id, metadata: { warrantyCaseId: warrantyCase.id, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 } } })
      return photo
    })
    return json(metadata(created), { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar la foto.', 409) }
}
