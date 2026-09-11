import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'

export async function POST(request: Request) {
  const tenant = tenantId(request)
  if (!tenant) return error('Falta x-tenant-id.', 401)
  const body = await request.json()
  if (!body.pin) return error('El PIN es obligatorio.', 400)
  const users = await prisma.user.findMany({ where: { tenantId: tenant, status: 'ACTIVE' } })
  const user = (await Promise.all(users.map(async (candidate) => ({ candidate, ok: await bcrypt.compare(String(body.pin), candidate.pinHash) })))).find((x) => x.ok)?.candidate
  if (!user) return error('PIN inválido.', 401)
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: user.id, action: 'LOGIN_PIN', entity: 'User', entityId: user.id, metadata: { source: 'pos' } } })
  return json({ accessToken: randomUUID(), user: { id: user.id, name: user.name, role: user.role, branchId: user.branchId } })
}
