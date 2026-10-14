import bcrypt from 'bcryptjs'
import { prisma } from '../../../../lib/prisma'
import { authRequestMetadata, requireCompanySession, requireOwnerCompanySession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { pinValido } from '../../../../lib/pin'

function accountCreated(settings: unknown) {
  return pendingOnboarding(settings) && (settings as Record<string, any>).onboarding.source === 'account'
}

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
  if (!pinValido(pin)) return error('Elegí un PIN de 4 a 6 dígitos.', 400)

  const owner = await requireOwnerCompanySession(request)
  const result = await prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findUnique({ where: { id: company.tenantId }, select: { id: true, settings: true } })
    if (!tenant || !pendingOnboarding(tenant.settings)) throw new Error('NOT_PENDING')
    // Una empresa creada por una cuenta (createCompany) no tiene contraseña
    // propia: el PIN del administrador solo lo fija la cuenta que la creó
    // (sesión de empresa con cuenta y pertenencia OWNER vigente) y se aplica a
    // su perfil vinculado, nunca al "primer ADMIN".
    if (accountCreated(tenant.settings)) {
      if (!owner) throw new Error('ACCOUNT_REQUIRED')
      const own = await tx.user.findFirst({ where: { id: owner.userId, tenantId: tenant.id, role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
      if (!own) throw new Error('ADMIN_MISSING')
    }
    const admin = owner && accountCreated(tenant.settings)
      ? { id: owner.userId }
      : await tx.user.findFirst({ where: { tenantId: tenant.id, role: 'ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (!admin) throw new Error('ADMIN_MISSING')
    const settings = tenant.settings as Record<string, any>
    const updated = await tx.user.update({ where: { id: admin.id }, data: { pinHash: await bcrypt.hash(pin, 12), pinLength: pin.length, failedLoginAttempts: 0, lockedUntil: null }, select: { id: true, name: true, branchId: true, pinLength: true } })
    await tx.tenant.update({ where: { id: tenant.id }, data: { settings: { ...settings, onboarding: { ...(settings.onboarding || {}), adminPinPending: false, completedAt: new Date().toISOString() } } } })
    await tx.auditLog.create({ data: { tenantId: tenant.id, userId: admin.id, action: 'ONBOARDING_ADMIN_PIN_CONFIGURED', entity: 'Tenant', entityId: tenant.id, metadata: authRequestMetadata(request) } })
    return updated
  }).catch(cause => {
    if (cause instanceof Error && cause.message === 'NOT_PENDING') return null
    if (cause instanceof Error && cause.message === 'ACCOUNT_REQUIRED') return 'ACCOUNT_REQUIRED' as const
    throw cause
  })
  if (result === 'ACCOUNT_REQUIRED') return error('Esta empresa solo puede configurarla la cuenta que la creó.', 403)
  if (!result) return error('La configuración inicial ya fue completada o no está disponible.', 409)
  return json({ admin: result })
}
