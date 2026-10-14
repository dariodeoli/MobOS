import { requireAccountContext } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { listTenantsForAccount } from '../../../../lib/membership'
import { prisma } from '../../../../lib/prisma'
import { canCreateCompany } from '../../../../lib/membership-rules'

export async function GET(request: Request) {
  const ctx = await requireAccountContext(request)
  if (!ctx) return error('Sesión inválida o sin cuenta vinculada.', 401)
  const [tenants, current] = await Promise.all([
    listTenantsForAccount(ctx.accountId, ctx.tenantId),
    prisma.tenantMembership.findUnique({ where: { accountId_tenantId: { accountId: ctx.accountId, tenantId: ctx.tenantId } }, select: { role: true } }),
  ])
  return json({ tenants, canCreate: canCreateCompany(current?.role) }, { headers: { 'Cache-Control': 'no-store' } })
}
