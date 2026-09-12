import { prisma } from '../../../../lib/prisma'
import { json } from '../../../../lib/http'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * No reset token is generated until a transactional email provider exists in
 * the server environment. The uniform accepted response prevents account
 * enumeration and guarantees that this route cannot alter a password.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (emailPattern.test(email)) {
    const tenant = await prisma.tenant.findUnique({ where: { email }, select: { id: true } })
    if (tenant) await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'PASSWORD_RECOVERY_REQUESTED_UNAVAILABLE', entity: 'Tenant', entityId: tenant.id, metadata: { providerConfigured: false } } })
  }
  return json({ ok: true, recoveryAvailable: false, message: 'Si existe una cuenta con ese correo, recibirá instrucciones cuando la recuperación por correo esté habilitada.' }, { status: 202 })
}
