import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { ROLES_AUDITORIA } from '../../../../lib/audit'

// Actores con movimientos en la auditoría: alimenta el filtro "quién hizo qué".
// Misma restricción de rol que el listado (ADMIN/GERENTE).
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!(ROLES_AUDITORIA as readonly string[]).includes(session.user.role)) return error('No autorizado.', 403)
  const grupos = await prisma.auditLog.groupBy({ by: ['userId'], where: { tenantId: tenant }, _count: { _all: true } })
  const ids = grupos.map((grupo) => grupo.userId).filter((id): id is string => Boolean(id))
  const usuarios = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []
  const nombrePorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.name]))
  const actores = grupos
    .filter((grupo): grupo is typeof grupo & { userId: string } => Boolean(grupo.userId))
    .map((grupo) => ({ id: grupo.userId, name: nombrePorId.get(grupo.userId) || 'Usuario', movimientos: grupo._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return json({ actores })
}
