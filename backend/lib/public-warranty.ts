import { prisma } from './prisma'
import { buscarPorTokenPublico } from './public-token'

const SELECT = {
  tenantId: true,
  tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
  id: true, customerName: true, serial: true, description: true, status: true, createdAt: true, expiresAt: true,
  warrantyDays: true, coverage: true, exclusions: true,
  branch: { select: { name: true, phone: true, city: true } },
  orderItem: { select: { description: true, product: { select: { name: true } }, order: { select: { createdAt: true, orderNumber: true } } } },
} as const

// Misma resolución para documento y logo, sin consumir ni modificar el token.
export async function cargarGarantiaPublica(token: string) {
  if (!token || token.length > 200) return { row: null, hash: null, legacy: false }
  return buscarPorTokenPublico(
    token,
    publicTokenHash => prisma.warrantyCase.findUnique({ where: { publicTokenHash }, select: SELECT }),
    publicToken => prisma.warrantyCase.findUnique({ where: { publicToken }, select: SELECT }),
  )
}
