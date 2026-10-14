import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { supplierBadge } from '../../../../lib/cost-visibility'

// Insignias de proveedor (#400): lo único del proveedor que ve cualquier rol con
// acceso de lectura a stock. Nunca el nombre real, el documento ni los contactos;
// el nombre completo vive en /api/suppliers (solo administración y gerencia).
// Mientras la unidad A (ícono/color de proveedor) no esté, esos campos van en null.
export async function GET(request: Request) {
  const tenant = await tenantId(request)
  const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:read', 'stock:manage'])) return error('No autorizado.', 403)
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: tenant }, select: { id: true, code: true }, orderBy: { code: 'asc' }, take: 2000 })
  return json(suppliers.map(supplier => {
    const badge = supplierBadge(supplier)
    return { id: badge.id, code: badge.code, icon: badge.icon ?? null, color: badge.color ?? null }
  }))
}
