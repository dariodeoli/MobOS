import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { effectivePermissions, requireSession } from '../../../../lib/auth'
import { canManageDelivery } from '../../../../lib/delivery'

// Repartidores disponibles para asignar: usuarios activos de la empresa con el
// permiso de reparto. Se listan acá porque el vendedor o la caja no pueden
// consultar /api/users (reservado a administración).
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManageDelivery(session.user)) return error('No autorizado.', 403)
  const usuarios = await prisma.user.findMany({
    where: { tenantId: tenant, status: 'ACTIVE' },
    select: { id: true, name: true, role: true, branchId: true, permissions: true },
    orderBy: { name: 'asc' },
  })
  const repartidores = usuarios
    .filter(usuario => effectivePermissions(usuario.role, usuario.permissions).some(permiso => permiso === '*' || permiso === 'delivery:use'))
    .map(usuario => ({ id: usuario.id, name: usuario.name, role: usuario.role, branchId: usuario.branchId }))
  return json(repartidores)
}
