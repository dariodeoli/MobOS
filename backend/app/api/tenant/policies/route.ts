import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { POLICY_LABELS, POLICY_MAX_CHARS, POLICY_TYPES, policiesFrom } from '../../../../lib/policies'

// Políticas de la empresa (#433). Solo el dueño (ADMIN) las lee completas y
// las edita; el resto del equipo usa /api/tenant/policies/print (resumen).
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede ver las políticas completas.', 403)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { slug: true, settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  const policies = policiesFrom(tenant.settings)
  return json({
    slug: tenant.slug,
    maxChars: POLICY_MAX_CHARS,
    policies: POLICY_TYPES.map(type => ({ type, label: POLICY_LABELS[type], ...policies[type] })),
  })
}
