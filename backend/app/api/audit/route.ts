import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { MAX_AUDIT_LIMIT, ROLES_AUDITORIA, parseFiltrosAuditoria, whereAuditoria } from '../../../lib/audit'

// La auditoría es la memoria del negocio: quién hizo qué y cuándo. Solo la ven
// administración y gerencia, porque incluye movimientos de equipo y de dinero.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!(ROLES_AUDITORIA as readonly string[]).includes(session.user.role)) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const limit = Math.min(MAX_AUDIT_LIMIT, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  const filtros = parseFiltrosAuditoria(params)
  if (!filtros.ok) return error(filtros.error)
  const rows = await prisma.auditLog.findMany({
    where: whereAuditoria(tenant, filtros.filtros),
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  return json(rows)
}
