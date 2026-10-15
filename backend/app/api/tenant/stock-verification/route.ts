import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { canVerify, policyFromSettings, verificationOwner, verificationPolicy } from '../../../../lib/stock-verification-policy'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  if (!tenant) return error('Empresa no encontrada.', 404)
  const policy = policyFromSettings(tenant.settings)
  return json({ policy, canConfigure: await verificationOwner(request, session), canVerify: canVerify(policy, session.user.role) }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function PUT(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!await verificationOwner(request, session)) return error('Solo el dueño de la empresa puede configurar la verificación.', 403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.roles) || !Array.isArray(body.records)) return error('Indicá roles y datos a registrar.', 400)
  const policy = verificationPolicy(body)
  if (policy.roles.length !== new Set(body.roles).size || policy.records.length !== new Set(body.records).size) return error('Roles o datos inválidos.', 400)
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${session.user.tenantId} FOR UPDATE`
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId }, select: { settings: true } })
    const settings = tenant.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings) ? tenant.settings as Record<string, unknown> : {}
    await tx.tenant.update({ where: { id: session.user.tenantId }, data: { settings: { ...settings, stockVerification: policy } as Prisma.InputJsonObject } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'STOCK_VERIFICATION_POLICY_UPDATED', entity: 'Tenant', entityId: session.user.tenantId, metadata: { previous: policyFromSettings(settings), policy, configuredAt: new Date().toISOString() } } })
  })
  return json({ policy, canConfigure: true, canVerify: canVerify(policy, session.user.role) })
}
