import bcrypt from 'bcryptjs'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password || body?.confirmation !== 'RESTORE') return error('No se pudo recuperar la empresa.', 400)
  const tenant = await prisma.tenant.findFirst({ where: { email }, select: { id: true, passwordHash: true, archivedAt: true } })
  if (!tenant?.archivedAt || !tenant.passwordHash || !(await bcrypt.compare(password, tenant.passwordHash))) return error('No se pudo recuperar la empresa.', 401)
  await prisma.$transaction(async tx => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { archivedAt: null, archivedReason: null, lockedUntil: null, failedLoginAttempts: 0 } })
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'TENANT_RECOVERED', entity: 'Tenant', entityId: tenant.id, metadata: {} } })
  })
  return json({ ok: true })
}
