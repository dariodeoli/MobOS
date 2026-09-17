import { createHash } from 'node:crypto'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { deleteAttachment, readAttachment, saveAttachment } from '../../../../lib/attachment-storage'

const MAX_LOGO_BYTES = 1024 * 1024
const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const AREA = 'branding'
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

class LogoValidationError extends Error {
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

async function readLogoFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') throw new LogoValidationError(400, 'El campo logo es obligatorio.')
  const mimeType = value.type.trim().toLowerCase()
  if (!LOGO_MIME_TYPES.includes(mimeType as (typeof LOGO_MIME_TYPES)[number])) throw new LogoValidationError(415, 'El logo debe ser PNG, JPG o WebP.')
  if (!Number.isFinite(value.size) || value.size <= 0) throw new LogoValidationError(400, 'El logo no puede estar vacío.')
  if (value.size > MAX_LOGO_BYTES) throw new LogoValidationError(413, 'El logo supera el límite de 1 MiB.')
  const bytes = new Uint8Array(await value.arrayBuffer())
  if (!bytes.byteLength) throw new LogoValidationError(400, 'El logo no puede estar vacío.')
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new LogoValidationError(413, 'El logo supera el límite de 1 MiB.')
  if (!hasMagicBytes(bytes, mimeType)) throw new LogoValidationError(415, 'El contenido del archivo no coincide con su MIME declarado.')
  return { data: Buffer.from(bytes), mimeType, sha256: createHash('sha256').update(bytes).digest('hex') }
}

// El logo es de la empresa: lo ve cualquier usuario con sesión y lo cambia
// administración. Los bytes salen del volumen de adjuntos con respaldo en base.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId: session.user.tenantId } })
  if (!logo) return error('La empresa todavía no tiene logo.', 404)
  const bytes = await readAttachment({ storageKey: logo.storageKey, data: logo.data ?? new Uint8Array() })
  return new Response(bytes, {
    headers: {
      'Content-Type': logo.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="logo.${EXTENSION[logo.mimeType] || 'png'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  })
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede cambiar el logo.', 403)
  try {
    const form = await request.formData()
    const file = await readLogoFile(form.get('logo'))
    const anterior = await prisma.tenantLogo.findUnique({ where: { tenantId: session.user.tenantId } })
    const { storageKey } = await saveAttachment({ tenantId: session.user.tenantId, area: AREA, fileName: `logo.${EXTENSION[file.mimeType]}`, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
    await prisma.tenantLogo.upsert({
      where: { tenantId: session.user.tenantId },
      create: { tenantId: session.user.tenantId, storageKey, data: file.data, mimeType: file.mimeType, sha256: file.sha256 },
      update: { storageKey, data: file.data, mimeType: file.mimeType, sha256: file.sha256 },
    })
    if (anterior?.storageKey && anterior.storageKey !== storageKey) await deleteAttachment(anterior)
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_LOGO_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { mimeType: file.mimeType, bytes: file.data.byteLength } } })
    return json({ ok: true, mimeType: file.mimeType })
  } catch (cause) {
    if (cause instanceof LogoValidationError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar el logo.', 400)
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede cambiar el logo.', 403)
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId: session.user.tenantId } })
  if (!logo) return json({ ok: true })
  await prisma.tenantLogo.delete({ where: { tenantId: session.user.tenantId } })
  await deleteAttachment(logo)
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TENANT_LOGO_REMOVED', entity: 'Tenant', entityId: session.user.tenantId } })
  return json({ ok: true })
}
