import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { hashToken } from './auth'
import { AuthFlowError, GoogleIdentity } from './google-oauth'

export function onboardingInput(body: any) {
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''
  const adminName = typeof body?.adminName === 'string' ? body.adminName.trim() : ''
  if (!companyName || companyName.length > 100 || !adminName || adminName.length > 100 || typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password) > 72 || typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin) || body.confirmOwnership !== true) throw new AuthFlowError('onboarding', 'Completá tienda y administrador, contraseña de al menos 12 caracteres (máximo 72 bytes), PIN de 4 dígitos y confirmación de alta.')
  return { companyName, adminName, password: body.password, pin: body.pin }
}
export async function googleCompany(identity: GoogleIdentity, body: any) {
  const linked = await prisma.googleIdentity.findUnique({ where: { subject: identity.sub }, include: { tenant: true } })
  let tenant = linked?.tenant
  if (!tenant) {
    if (body?.action !== 'create') throw new AuthFlowError('onboarding_required', 'Esta cuenta todavía no tiene tienda. Completá el alta.', 409)
    const input = onboardingInput(body)
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(input.password, 12), bcrypt.hash(input.pin, 12)])
    try {
      tenant = await prisma.$transaction(async tx => {
        // Never attach Google to an existing email or promote an existing user.
        if (await tx.tenant.findUnique({ where: { email: identity.email } })) throw new AuthFlowError('existing_account', 'Este correo ya tiene una empresa. Entrá con contraseña; la vinculación con Google requiere validar al dueño.', 409)
        const created = await tx.tenant.create({ data: { name: input.companyName, email: identity.email, passwordHash, slug: `tienda-${randomBytes(16).toString('hex')}` } })
        await tx.user.create({ data: { tenantId: created.id, name: input.adminName, email: identity.email, pinHash, role: 'ADMIN' } })
        await tx.googleIdentity.create({ data: { subject: identity.sub, tenantId: created.id } })
        return created
      })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new AuthFlowError('existing_account', 'La cuenta ya fue creada o el correo está en uso. Volvé a iniciar sesión.', 409)
      throw error
    }
  }
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 86400_000)
  await prisma.session.create({ data: { tenantId: tenant.id, level: 'COMPANY', tokenHash: hashToken(token), deviceId: `google:${randomBytes(16).toString('hex')}`, expiresAt } })
  return { token, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, expiresAt }
}
