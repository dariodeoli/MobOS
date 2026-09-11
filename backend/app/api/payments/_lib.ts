import { createHash } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import type { SessionContext } from '../../../lib/auth'

export const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_MULTIPART_BODY_BYTES = MAX_PROOF_SIZE_BYTES + 128 * 1024
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const RECONCILIATION_ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const

export class ProofValidationError extends Error {
  public readonly status: 400 | 413 | 415

  constructor(status: 400 | 413 | 415, message: string) {
    super(message)
    this.status = status
  }
}

export function canAccessPayment(session: SessionContext, branchId: string | null) {
  if (['VENDEDOR', 'CAJERA'].includes(session.user.role)) return session.user.branchId === branchId
  return true
}

export async function findAccessiblePayment(paymentId: string, session: SessionContext) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: session.user.tenantId },
    include: { order: { select: { branchId: true } } },
  })
  if (!payment || !canAccessPayment(session, payment.order.branchId)) return null
  return payment
}

export function safeDownloadName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? 'comprobante'
  return (baseName.replace(/[\u0000-\u001f\u007f]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'comprobante')
}

function hasMagicBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  if (mimeType === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  if (mimeType === 'application/pdf') return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  return false
}

export async function readProofFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') throw new ProofValidationError(400, 'El campo file es obligatorio.')
  const mimeType = value.type.trim().toLowerCase()
  if (!PROOF_MIME_TYPES.includes(mimeType as (typeof PROOF_MIME_TYPES)[number])) throw new ProofValidationError(415, 'Tipo de archivo no permitido. Use JPG, PNG, WEBP o PDF.')
  if (!Number.isFinite(value.size) || value.size <= 0) throw new ProofValidationError(400, 'El comprobante no puede estar vacío.')
  if (value.size > MAX_PROOF_SIZE_BYTES) throw new ProofValidationError(413, 'El comprobante supera el límite de 5 MiB.')
  const bytes = new Uint8Array(await value.arrayBuffer())
  if (!bytes.byteLength) throw new ProofValidationError(400, 'El comprobante no puede estar vacío.')
  if (bytes.byteLength > MAX_PROOF_SIZE_BYTES) throw new ProofValidationError(413, 'El comprobante supera el límite de 5 MiB.')
  if (!hasMagicBytes(bytes, mimeType)) throw new ProofValidationError(415, 'El contenido del archivo no coincide con su MIME declarado.')
  return {
    data: Buffer.from(bytes),
    fileName: safeDownloadName(value.name || 'comprobante'),
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export function normalizeReconciliationNote(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2000) throw new Error('note debe ser texto de hasta 2000 caracteres.')
  return value.trim() || null
}
