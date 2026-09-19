import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, name: true, slug: true, email: true, expenseLimitPyg: true, purchaseCreditLimitPyg: true } })
  const ownerAccess = tenant ? await prisma.googleStoreAccess.findFirst({ where: { tenantId: tenant.id, owner: true }, include: { identity: { select: { name: true, picture: true } } } }) : null
  const identity = ownerAccess?.identity ?? null
  return json({ user: session.user, tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, email: tenant.email, expenseLimitPyg: tenant.expenseLimitPyg, purchaseCreditLimitPyg: tenant.purchaseCreditLimitPyg } : null, ownerProfile: identity ? { name: identity.name, picture: identity.picture } : null })
}
