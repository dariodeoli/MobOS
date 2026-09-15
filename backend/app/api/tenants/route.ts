import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Búsqueda mínima de empresas por nombre para los permisos de stock compartido.
// Solo ADMIN ve resultados y únicamente id + nombre: nunca datos de otras
// empresas. La interfaz elige por nombre; el id viaja en el POST del permiso.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo un administrador puede buscar empresas.', 403)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  if (q.length < 2) return json([])
  const tenants = await prisma.tenant.findMany({
    where: { id: { not: session.user.tenantId }, archivedAt: null, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
    take: 10,
  })
  return json(tenants)
}
