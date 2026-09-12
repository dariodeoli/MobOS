import bcrypt from 'bcryptjs'
import { prisma } from '../../../../lib/prisma'
import { authRequestMetadata, requireCompanySession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'

function pendingOnboarding(settings: unknown) {
  return !!settings && typeof settings === 'object' && !Array.isArray(settings)
    && !!(settings as Record<string, unknown>).onboarding
    && typeof (settings as Record<string, any>).onboarding === 'object'
    && (settings as Record<string, any>).onboarding.adminPinPending === true
}

/** Completes the mandatory security step after the low-friction store sign-up. */
export async function POST(request: Request) {
  const company = await requireCompanySession(request)
  if (!company) return error('Sesión de empresa inválida o expirada.', 401)
  const body = await request.json().catch(() => null)
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  if (!/^\d{4}$/.test(pin)) return error('Elegí un PIN de exactamente 4 dígitos.', 400)

  const result = await prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findUnique({ where: { id: company.tenantId }, select: { id: true, settings: true } })
    if (!tenant || !pendingOnboarding(tenant.settings)) throw new Error('NOT_PENDING')
    const admin = await tx.user.findFirst({ where: { tenantId: tenant.id, role: 'ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (!admin) throw new Error('ADMIN_MISSING')
    const settings = tenant.settings as Record<string, any>
    const updated = await tx.user.update({ where: { id: admin.id }, data: { pinHash: await bcrypt.hash(pin, 12), failedLoginAttempts: 0, lockedUntil: null }, select: { id: true, name: true, branchId: true } })
    await tx.tenant.update({ where: { id: tenant.id }, data: { settings: { ...settings, onboarding: { ...(settings.onboarding || {}), adminPinPending: false, completedAt: new Date().toISOString() } } } })
    await tx.auditLog.create({ data: { tenantId: tenant.id, userId: admin.id, action: 'ONBOARDING_ADMIN_PIN_CONFIGURED', entity: 'Tenant', entityId: tenant.id, metadata: authRequestMetadata(request) } })
    return updated
  }).catch(cause => {
    if (cause instanceof Error && cause.message === 'NOT_PENDING') return null
    throw cause
  })
  if (!result) return error('La configuración inicial ya fue completada o no está disponible.', 409)
  return json({ admin: result })
}
