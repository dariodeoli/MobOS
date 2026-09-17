import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

// Resumen del listado de clientes: total, mayoristas y cliente final. El tipo
// sale del campo pricingTier de la ficha.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const total = await prisma.customer.count({ where: { tenantId: session.user.tenantId } })
  const mayoristas = await prisma.customer.count({
    where: { tenantId: session.user.tenantId, pricingTier: 'WHOLESALE' },
  })
  return json({ total, wholesalers: mayoristas, retail: Math.max(0, total - mayoristas) })
}
