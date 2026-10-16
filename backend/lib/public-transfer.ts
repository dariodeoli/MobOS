import { prisma } from './prisma'

// Mantiene la normalización/lookup del GET existente; no rota ni reescribe tokens.
export async function cargarRemitoPublico(token: string) {
  token = typeof token === 'string' && token.trim() ? token.trim().slice(0, 200) : ''
  if (!token || token.length > 200) return null
  return prisma.stockTransfer.findUnique({
    where: { publicToken: token },
    include: {
      tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
      sourceBranch: { select: { name: true, address: true, city: true, department: true, phone: true } },
      destinationBranch: { select: { name: true, address: true, city: true, department: true, phone: true } },
      createdBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      lines: { include: { sourceProduct: { select: { name: true, sku: true } } } },
    },
  })
}
