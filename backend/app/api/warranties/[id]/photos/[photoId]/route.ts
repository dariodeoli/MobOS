import { error } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { prisma } from '../../../../../../lib/prisma'
import { safeDownloadName } from '../../../../payments/_lib'

type RouteContext = { params: { id: string; photoId: string } }

// Descarga de una foto de garantía. Alcance igual al listado: todos los roles
// menos VENDEDOR; GERENTE solo su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role === 'VENDEDOR') return error('No autorizado.', 403)
  const warrantyCaseId = (params.id || '').trim().slice(0, 128)
  const photoId = (params.photoId || '').trim().slice(0, 128)
  if (!warrantyCaseId || !photoId) return error('Foto no encontrada.', 404)

  const photo = await prisma.warrantyPhoto.findFirst({
    where: {
      id: photoId,
      warrantyCaseId,
      tenantId: session.user.tenantId,
      warrantyCase: {
        ...(session.user.role === 'GERENTE' ? { branchId: session.user.branchId ?? '' } : {}),
      },
    },
    select: { data: true, fileName: true, mimeType: true, sizeBytes: true },
  })
  if (!photo) return error('Foto no encontrada.', 404)

  return new Response(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.mimeType,
      'Content-Length': String(photo.sizeBytes),
      'Content-Disposition': `inline; filename="${safeDownloadName(photo.fileName)}"`,
    },
  })
}
