import { NextResponse } from 'next/server'
import { error } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { prisma } from '../../../../../../lib/prisma'
import { findAccessiblePayment, safeDownloadName } from '../../../_lib'

type RouteContext = { params: { paymentId: string; proofId: string } }

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const payment = await findAccessiblePayment(params.paymentId, session)
  if (!payment) return error('Comprobante no encontrado.', 404)

  const proof = await prisma.$transaction(async tx => {
    const found = await tx.paymentProof.findFirst({
      where: { id: params.proofId, paymentId: payment.id, tenantId: session.user.tenantId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, data: true },
    })
    if (!found) return null
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PAYMENT_PROOF_DOWNLOADED', entity: 'PaymentProof', entityId: found.id, metadata: { paymentId: payment.id, sizeBytes: found.sizeBytes } } })
    return found
  })
  if (!proof) return error('Comprobante no encontrado.', 404)

  return new NextResponse(new Uint8Array(proof.data), {
    status: 200,
    headers: {
      'Content-Type': proof.mimeType,
      'Content-Length': String(proof.sizeBytes),
      'Content-Disposition': `attachment; filename="${safeDownloadName(proof.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
