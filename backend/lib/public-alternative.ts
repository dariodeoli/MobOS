import { prisma } from './prisma'
import { hashToken } from './supply-alternatives'

export async function cargarAlternativaPublica(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null
  const row = await prisma.supplyAlternative.findFirst({ where: { publicTokenHash: hashToken(token) }, include: {
    tenant: { select: { name: true } },
    supplyNeed: { select: { id: true, tenantId: true, productId: true, condition: true, quantity: true, promisedAt: true, status: true, branch: { select: { name: true, phone: true, tenantId: true } }, customer: { select: { name: true } }, product: { select: { name: true, sku: true } } } },
  } })
  return row?.supplyNeed.tenantId === row?.tenantId ? row : null
}
