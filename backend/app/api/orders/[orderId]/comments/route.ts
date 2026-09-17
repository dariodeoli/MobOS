import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { canAccessOrder } from '../../../../../lib/orders'
import { MAX_MULTIPART_BODY_BYTES, readProofFile } from '../../../payments/_lib'

async function accessibleOrder(orderId: string, tenant: string, user: { id: string; role: string; branchId: string | null }) {
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, select: { id: true, sellerId: true, branchId: true } })
  if (!order || !canAccessOrder(user, order)) return null
  return order
}

const authorSelect = { select: { id: true, name: true } }
const photoSelect = { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } }

// Comentarios internos del pedido con sus fotos (metadatos; los bytes se
// descargan por la ruta de la foto).
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await accessibleOrder(orderId, tenant, session.user)
  if (!order) return error('Pedido no encontrado.', 404)
  const comments = await prisma.orderComment.findMany({
    where: { tenantId: tenant, orderId: order.id },
    include: { user: authorSelect, photos: photoSelect },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return json(comments)
}

// Un comentario puede traer un archivo (JPG/PNG/WEBP/PDF, hasta 5 MiB) y/o
// texto. Se guarda con la misma política de bytes que los comprobantes.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await accessibleOrder(orderId, tenant, session.user)
  if (!order) return error('Pedido no encontrado.', 404)
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
    const comment = await tx.orderComment.create({
      data: {
        tenantId: tenant, orderId: order.id, userId: session.user.id, body: body || 'Adjunto',
        ...(file ? { photos: { create: { tenantId: tenant, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256, data: file.data } } } : {}),
      },
      include: { user: authorSelect, photos: photoSelect },
    })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_COMMENTED', entity: 'Order', entityId: order.id, metadata: { commentId: comment.id, hasPhoto: Boolean(file) } } })
    return comment
  })
  return json(created, { status: 201 })
}
