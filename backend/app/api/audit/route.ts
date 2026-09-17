import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// La auditoría es la memoria del negocio: quién hizo qué y cuándo. Solo la ven
// administración y gerencia, porque incluye movimientos de equipo y de dinero.
const ROLES = ['ADMIN', 'GERENTE']
const MAX_LIMIT = 200

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!ROLES.includes(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  const action = (params.get('action') || '').trim().slice(0, 80)
  const entity = (params.get('entity') || '').trim().slice(0, 80)
  const q = (params.get('q') || '').trim().slice(0, 120)
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' as const } }, { entityId: { contains: q, mode: 'insensitive' as const } }] } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  return json(rows)
}
