import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { sucursalEfectiva } from '../../../../lib/sucursal-efectiva'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id: true, name: true, slug: true, email: true, expenseLimitPyg: true, purchaseCreditLimitPyg: true, belowListPct: true } })
  const ownerAccess = tenant ? await prisma.googleStoreAccess.findFirst({ where: { tenantId: tenant.id, owner: true }, include: { identity: { select: { name: true, picture: true } } } }) : null
  const identity = ownerAccess?.identity ?? null
  // #286: sin sucursal asignada la sesión expone la efectiva (última usada →
  // primera creada) para que el POS resuelva catálogo, unidades y venta.
  const efectiva = session.user.branchId ? null : await sucursalEfectiva(session)
  const usuario = efectiva ? { ...session.user, branchId: efectiva } : session.user
  return json({ user: usuario, tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, email: tenant.email, expenseLimitPyg: tenant.expenseLimitPyg, purchaseCreditLimitPyg: tenant.purchaseCreditLimitPyg, belowListPct: tenant.belowListPct } : null, ownerProfile: identity ? { name: identity.name, picture: identity.picture } : null })
}
