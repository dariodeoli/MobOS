import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { hashToken, requiresAdminPinSetup } from './auth'
import { AuthFlowError, GoogleIdentity } from './google-oauth'

export function onboardingInput(body: any) {
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName || companyName.length > 100) throw new AuthFlowError('onboarding', 'Completá el nombre de tu tienda.')
  return { companyName }
}
export async function googleCompany(identity: GoogleIdentity, body: any) {
  const linked = await prisma.googleIdentity.findUnique({ where: { subject: identity.sub }, include: { tenant: true } })
  let tenant = linked?.tenant
  let newlyCreated = false
  if (!tenant) {
    if (body?.action !== 'create') throw new AuthFlowError('onboarding_required', 'Esta cuenta todavía no tiene tienda. Completá el alta.', 409)
    const input = onboardingInput(body)
    const pinHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
    try {
      tenant = await prisma.$transaction(async tx => {
        // Never attach Google to an existing email or promote an existing user.
        if (await tx.tenant.findUnique({ where: { email: identity.email } })) throw new AuthFlowError('existing_account', 'Este correo ya tiene una empresa. Entrá con contraseña; la vinculación con Google requiere validar al dueño.', 409)
        const created = await tx.tenant.create({ data: { name: input.companyName, email: identity.email, emailVerifiedAt: new Date(), slug: `tienda-${randomBytes(16).toString('hex')}`, settings: { onboarding: { adminPinPending: true } } } })
        await tx.user.create({ data: { tenantId: created.id, name: 'Administrador', email: identity.email, pinHash, role: 'ADMIN' } })
        await tx.googleIdentity.create({ data: { subject: identity.sub, tenantId: created.id } })
        return created
      })
      newlyCreated = true
    } catch (error: any) {
      if (error?.code === 'P2002') throw new AuthFlowError('existing_account', 'La cuenta ya fue creada o el correo está en uso. Volvé a iniciar sesión.', 409)
      throw error
    }
  }
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 86400_000)
  await prisma.session.create({ data: { tenantId: tenant.id, level: 'COMPANY', tokenHash: hashToken(token), deviceId: `google:${randomBytes(16).toString('hex')}`, expiresAt } })
  return { token, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, onboardingRequired: requiresAdminPinSetup(tenant.settings), expiresAt, newlyCreated }
}
