import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { metricasWebPush } from '../../../../lib/web-push-eventos'

// A1 (#279): métricas de los avisos (evaluados, enviados, silenciados, podados).
// Cada usuario ve las suyas; administración ve además el total de la tienda.
export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const propias = await metricasWebPush({ tenantId: tenant, userId: session.user.id })
  if (session.user.role !== 'ADMIN') return json({ propias })
  const tienda = await metricasWebPush({ tenantId: tenant })
  return json({ propias, tienda })
}
