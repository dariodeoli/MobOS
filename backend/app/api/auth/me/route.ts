import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, name: true, slug: true, email: true } })
  const identity = tenant ? await prisma.googleIdentity.findUnique({ where: { tenantId: tenant.id }, select: { name: true, picture: true } }) : null
  return json({ user: session.user, tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, email: tenant.email } : null, ownerProfile: identity ? { name: identity.name, picture: identity.picture } : null })
}
