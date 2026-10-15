import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { policiesFrom, policySummary } from '../../../../../lib/policies'

// Resumen para los comprobantes (#433): cualquier rol con sesión puede imprimir,
// así que solo se entrega lo PUBLICADO (lo mismo que ya ve el cliente) en versión
// corta, más el slug para armar el enlace a las políticas públicas.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { slug: true, settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  const policies = policiesFrom(tenant.settings)
  const algunaPublicada = Object.values(policies).some(policy => policy.published)
  return json({
    slug: algunaPublicada ? tenant.slug : null,
    garantia: policies.garantia.published ? policySummary(policies.garantia.content) : '',
    cambios: policies.cambios.published ? policySummary(policies.cambios.content, 3) : '',
    garantiaPublicada: policies.garantia.published,
    cambiosPublicada: policies.cambios.published,
  })
}
