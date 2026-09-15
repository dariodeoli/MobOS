import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Alertas de reposición: productos activos con stock <= reorderPoint (solo
// cuando el umbral es mayor a 0) y productos agotados (stock 0), aunque no
// tengan umbral configurado. ADMIN ve toda la empresa (puede acotar por
// branchId); GERENTE solo su sucursal; VENDEDOR/CAJERA no acceden.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const requested = params.get('branchId')
  if (session.user.role === 'GERENTE') {
    if (!session.user.branchId) return json({ alerts: [], outOfStock: [] })
    if (requested && requested !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  }
  const branchId = session.user.role === 'GERENTE' ? session.user.branchId : requested
  const products = await prisma.product.findMany({
    where: { tenantId: tenant, isActive: true, ...(branchId ? { branchId } : {}) },
    select: { id: true, sku: true, name: true, category: true, stock: true, reorderPoint: true, branchId: true, branch: { select: { id: true, name: true } } },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take: 1000,
  })
  const withMinimum = products.map(product => ({ ...product, stockMinimum: product.reorderPoint }))
  const alerts = withMinimum
    .filter(product => product.reorderPoint !== null && product.reorderPoint > 0 && product.stock <= product.reorderPoint)
    .map(product => ({ ...product, level: 'LOW' as const }))
  const outOfStock = withMinimum
    .filter(product => product.stock <= 0)
    .map(product => ({ ...product, level: 'OUT' as const }))
  return json({ alerts, outOfStock })
}
