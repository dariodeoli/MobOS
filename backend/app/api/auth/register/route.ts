import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../../lib/prisma'
import { authenticateCompany } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Creates an isolated tenant without requiring a social identity provider. */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return error('Los datos de registro no son válidos.', 400) }

  const companyName = String(body.companyName ?? '').trim()
  const adminName = String(body.adminName ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const pin = String(body.pin ?? '')
  const deviceId = String(body.deviceId ?? '').trim()

  if (!companyName || companyName.length > 100 || !adminName || adminName.length > 100 || !emailPattern.test(email) || password.length < 12 || Buffer.byteLength(password) > 72 || !/^\d{4}$/.test(pin) || !deviceId) {
    return error('Completá tienda, administrador, correo válido, contraseña de al menos 12 caracteres y PIN de 4 dígitos.', 400)
  }

  try {
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(password, 12), bcrypt.hash(pin, 12)])
    await prisma.$transaction(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { email }, select: { id: true } })
      if (existing) throw new Error('EMAIL_EXISTS')
      const tenant = await tx.tenant.create({ data: { name: companyName, email, passwordHash, slug: `tienda-${randomBytes(16).toString('hex')}` } })
      await tx.user.create({ data: { tenantId: tenant.id, name: adminName, email, pinHash, role: 'ADMIN' } })
    })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'EMAIL_EXISTS') return error('Ya existe una tienda registrada con ese correo. Iniciá sesión o usá otro correo.', 409)
    return error('No se pudo crear la tienda. Probá nuevamente.', 500)
  }

  const session = await authenticateCompany({ email, password, deviceId })
  if (!session) return error('La tienda fue creada, pero no se pudo abrir la sesión. Iniciá sesión con tus credenciales.', 500)
  return json({ companyToken: session.accessToken, expiresAt: session.expiresAt, tenant: session.tenant, sellers: session.sellers, scope: session.scope }, { status: 201 })
}
