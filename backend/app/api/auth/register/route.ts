import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../../lib/prisma'
import { authenticateCompany, AuthRateLimitError, authRequestMetadata, enforceAuthRateLimit } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { COOKIE_COMPANY, sessionCookieOptions } from '../../../../lib/google-oauth'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Creates an isolated tenant without requiring a social identity provider. */
export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, 'company-register', 8)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return error('Los datos de registro no son válidos.', 400) }

  const companyName = String(body.companyName ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const deviceId = String(body.deviceId ?? '').trim()

  if (!companyName || companyName.length > 100 || !emailPattern.test(email) || password.length < 8 || Buffer.byteLength(password) > 72 || !deviceId) {
    return error('Completá el nombre de la tienda, un correo válido y una contraseña de entre 8 y 72 caracteres.', 400)
  }

  try {
    // The first PIN is deliberately impossible to use. The owner chooses it
    // after the account exists, keeping the sign-up form to three fields.
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(password, 12), bcrypt.hash(randomBytes(32).toString('hex'), 12)])
    await prisma.$transaction(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { email }, select: { id: true } })
      if (existing) throw new Error('EMAIL_EXISTS')
      const tenant = await tx.tenant.create({ data: { name: companyName, email, passwordHash, slug: `tienda-${randomBytes(16).toString('hex')}`, settings: { onboarding: { adminPinPending: true } } } })
      const admin = await tx.user.create({ data: { tenantId: tenant.id, name: 'Administrador', email, pinHash, role: 'ADMIN' } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, userId: admin.id, action: 'COMPANY_REGISTERED', entity: 'Tenant', entityId: tenant.id, metadata: authRequestMetadata(request) } })
    })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'EMAIL_EXISTS') return error('Ya existe una tienda registrada con ese correo. Iniciá sesión o usá otro correo.', 409)
    return error('No se pudo crear la tienda. Probá nuevamente.', 500)
  }

  const session = await authenticateCompany({ email, password, deviceId }, request)
  if (!session) return error('La tienda fue creada, pero no se pudo abrir la sesión. Iniciá sesión con tus credenciales.', 500)
  const response = json({ expiresAt: session.expiresAt, tenant: session.tenant, sellers: session.sellers, onboardingRequired: session.onboardingRequired, scope: session.scope }, { status: 201 })
  response.cookies.set(COOKIE_COMPANY, session.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
  return response
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) return json({ message: cause.message }, { status: 429, headers: { 'Retry-After': String(cause.retryAfterSeconds), 'Cache-Control': 'no-store' } })
    return error('No se pudo crear la tienda. Probá nuevamente.', 500)
  }
}
