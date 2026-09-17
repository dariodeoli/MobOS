import { createHash } from 'node:crypto'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { deleteAttachment, readAttachment, saveAttachment } from '../../../../../lib/attachment-storage'

type RouteContext = { params: { userId?: string } }
const MAX_AVATAR_BYTES = 1024 * 1024
const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const AREA = 'avatars'
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

class AvatarValidationError extends Error {
  public readonly status: 400 | 413 | 415

  constructor(status: 400 | 413 | 415, message: string) {
    super(message)
    this.status = status
  }
}

function hasMagicBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  if (mimeType === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  return false
}

async function readAvatarFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') throw new AvatarValidationError(400, 'El campo avatar es obligatorio.')
  const mimeType = value.type.trim().toLowerCase()
  if (!AVATAR_MIME_TYPES.includes(mimeType as (typeof AVATAR_MIME_TYPES)[number])) throw new AvatarValidationError(415, 'La foto debe ser PNG, JPG o WebP.')
  if (!Number.isFinite(value.size) || value.size <= 0) throw new AvatarValidationError(400, 'La foto no puede estar vacía.')
  if (value.size > MAX_AVATAR_BYTES) throw new AvatarValidationError(413, 'La foto supera el límite de 1 MiB.')
  const bytes = new Uint8Array(await value.arrayBuffer())
  if (!bytes.byteLength) throw new AvatarValidationError(400, 'La foto no puede estar vacía.')
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new AvatarValidationError(413, 'La foto supera el límite de 1 MiB.')
  if (!hasMagicBytes(bytes, mimeType)) throw new AvatarValidationError(415, 'El contenido del archivo no coincide con su MIME declarado.')
  return { data: Buffer.from(bytes), mimeType, sha256: createHash('sha256').update(bytes).digest('hex') }
}

async function usuarioDelTenant(userId: string, tenantId: string) {
  return prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } })
}

const puedeEditar = (session: { user: { id: string; role: string } }, userId: string) => session.user.id === userId || session.user.role === 'ADMIN'

// Foto de perfil: la ve cualquier usuario de la tienda y la cambia su dueño
// (o administración). Los bytes salen del volumen de adjuntos con respaldo en base.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const userId = (params.userId || '').trim().slice(0, 128)
  if (!userId) return error('Usuario obligatorio.')
  if (!(await usuarioDelTenant(userId, session.user.tenantId))) return error('Usuario no encontrado.', 404)
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } })
  if (!avatar) return error('El usuario no tiene foto.', 404)
  const bytes = await readAttachment({ storageKey: avatar.storageKey, data: avatar.data ?? new Uint8Array() })
  return new Response(bytes, {
    headers: {
      'Content-Type': avatar.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="avatar.${EXTENSION[avatar.mimeType] || 'png'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const userId = (params.userId || '').trim().slice(0, 128)
  if (!userId) return error('Usuario obligatorio.')
  if (!puedeEditar(session, userId)) return error('Solo podés cambiar tu propia foto.', 403)
  if (!(await usuarioDelTenant(userId, session.user.tenantId))) return error('Usuario no encontrado.', 404)
  try {
    const form = await request.formData()
    const file = await readAvatarFile(form.get('avatar'))
    const anterior = await prisma.userAvatar.findUnique({ where: { userId } })
    const { storageKey } = await saveAttachment({ tenantId: session.user.tenantId, area: AREA, fileName: `avatar.${EXTENSION[file.mimeType]}`, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
    await prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, storageKey, data: file.data, mimeType: file.mimeType, sha256: file.sha256 },
      update: { storageKey, data: file.data, mimeType: file.mimeType, sha256: file.sha256 },
    })
    if (anterior?.storageKey && anterior.storageKey !== storageKey) await deleteAttachment(anterior)
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'USER_AVATAR_UPDATED', entity: 'User', entityId: userId, metadata: { mimeType: file.mimeType, bytes: file.data.byteLength } } })
    return json({ ok: true, mimeType: file.mimeType })
  } catch (cause) {
    if (cause instanceof AvatarValidationError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar la foto.', 400)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const userId = (params.userId || '').trim().slice(0, 128)
  if (!userId) return error('Usuario obligatorio.')
  if (!puedeEditar(session, userId)) return error('Solo podés cambiar tu propia foto.', 403)
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } })
  if (!avatar) return json({ ok: true })
  await prisma.userAvatar.delete({ where: { userId } })
  await deleteAttachment(avatar)
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'USER_AVATAR_REMOVED', entity: 'User', entityId: userId } })
  return json({ ok: true })
}
