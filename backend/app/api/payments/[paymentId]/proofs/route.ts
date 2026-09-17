import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { saveAttachment } from '../../../../../lib/attachment-storage'
import { findAccessiblePayment, MAX_MULTIPART_BODY_BYTES, readProofFile } from '../../_lib'

type RouteContext = { params: { paymentId: string } }

function metadata(proof: {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  createdAt: Date
  uploadedBy: { id: string; name: string }
}) {
  return {
    id: proof.id,
    fileName: proof.fileName,
    mimeType: proof.mimeType,
    sizeBytes: proof.sizeBytes,
    sha256: proof.sha256,
    createdAt: proof.createdAt,
    uploader: proof.uploadedBy,
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)

  const proofs = await prisma.paymentProof.findMany({
    where: { paymentId: payment.id, tenantId: session.user.tenantId },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_PROOFS_VIEWED', entity: 'Payment', entityId: payment.id, metadata: { count: proofs.length } } })
  return json(proofs.map(metadata))
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Pago no encontrado.', 404)

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) return error('El comprobante supera el límite de 5 MiB.', 413)

  let file: Awaited<ReturnType<typeof readProofFile>>
  try {
    const form = await request.formData()
    file = await readProofFile(form.get('file'))
  } catch (cause) {
    if (cause instanceof Error && 'status' in cause) return error(cause.message, (cause as { status: 400 | 413 | 415 }).status)
    return error('No se pudo leer el comprobante.', 400)
  }

  // Write-through: si hay volumen configurado se guarda el archivo y en la
  // base queda el storageKey; `data` se conserva como respaldo del adjunto.
  const stored = await saveAttachment({ tenantId: session.user.tenantId, area: 'payment-proofs', fileName: file.fileName, mimeType: file.mimeType, sha256: file.sha256, data: file.data })
  const created = await prisma.$transaction(async tx => {
    const proof = await tx.paymentProof.create({
      data: {
        tenantId: session.user.tenantId,
        paymentId: payment.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        data: file.data,
        storageKey: stored.storageKey,
        uploadedById: session.user.id,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
    })
    await tx.paymentReconciliation.upsert({
      where: { paymentId: payment.id },
      create: { tenantId: session.user.tenantId, paymentId: payment.id, state: 'PENDING' },
      update: {},
    })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_PROOF_UPLOADED', entity: 'PaymentProof', entityId: proof.id, metadata: { paymentId: payment.id, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 } } })
    return proof
  })
  return json(metadata(created), { status: 201 })
}
