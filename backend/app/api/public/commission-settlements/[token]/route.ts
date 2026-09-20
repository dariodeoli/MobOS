import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

// Verificación pública de una liquidación de comisiones por su token (el QR
// del comprobante). Devuelve solo lo mínimo para verificar el papel: vendedor,
// período, total, estado y fecha de emisión. Nunca expone ventas, márgenes,
// clientes ni datos internos de la empresa.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const clean = typeof token === 'string' ? token.trim() : ''
  if (!clean || clean.length > 200) return error('Liquidación no encontrada.', 404)
  const settlement = await prisma.commissionSettlement.findUnique({
    where: { verificationToken: clean },
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
