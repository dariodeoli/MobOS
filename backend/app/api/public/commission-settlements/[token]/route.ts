import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { hashToken } from '../../../../../lib/auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

// Verificación pública de una liquidación de comisiones por su token (el QR
// del comprobante). Devuelve solo lo mínimo para verificar el papel: vendedor,
// período, total, estado y fecha de emisión. Nunca expone ventas, márgenes,
// clientes ni datos internos de la empresa.
//
// El token crudo no vive en la base (#172/#178): se busca por `sha256` y el
// límite de uso corta la fuerza bruta distribuida.
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'commission-settlements-public', 30, 60_000)
  if (limited) return limited

  const { token } = await context.params
  const clean = typeof token === 'string' ? token.trim() : ''
  if (!clean || clean.length > 200) return error('Liquidación no encontrada.', 404)
  const settlement = await prisma.commissionSettlement.findUnique({
    where: { verificationTokenHash: hashToken(clean) },
    select: {
      periodFrom: true,
      periodTo: true,
      totalPyg: true,
      status: true,
      createdAt: true,
      seller: { select: { name: true } },
    },
  })
  if (!settlement) return error('Liquidación no encontrada.', 404)
  return json({
    sellerName: settlement.seller?.name ?? null,
    periodFrom: settlement.periodFrom,
    periodTo: settlement.periodTo,
    totalPyg: settlement.totalPyg,
    status: settlement.status,
    emitidaEn: settlement.createdAt,
    verificado: true,
  })
}
