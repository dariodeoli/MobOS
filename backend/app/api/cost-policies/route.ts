import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const manager = (role: string) => ['ADMIN', 'GERENTE'].includes(role)
const validRate = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  return json(await prisma.costPolicy.findMany({ where: { tenantId: tenant }, orderBy: { category: 'asc' } }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!manager(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); const category = typeof body.category === 'string' ? body.category.trim() : ''
  if (!category || category.length > 100 || !validRate(body.insuranceRate)) return error('Categoría y seguro entre 0 y 100 son obligatorios.')
  const policy = await prisma.costPolicy.upsert({ where: { tenantId_category: { tenantId: tenant, category } }, create: { tenantId: tenant, category, insuranceRate: Number(body.insuranceRate), isActive: body.isActive !== false }, update: { insuranceRate: Number(body.insuranceRate), isActive: body.isActive !== false } })
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'COST_POLICY_SAVED', entity: 'CostPolicy', entityId: policy.id, metadata: { category, insuranceRate: Number(body.insuranceRate), isActive: policy.isActive } } })
  return json(policy, { status: 201 })
}
