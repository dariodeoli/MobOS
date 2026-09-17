import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { hashToken, requiresAdminPinSetup } from './auth'
import { AuthFlowError, GoogleIdentity } from './google-oauth'

export type GoogleStore = { id: string; name: string; slug: string }

export type GoogleCompanyResult =
  | { storeRequired: true; stores: GoogleStore[] }
  | { storeRequired?: false; token: string; tenant: GoogleStore; stores: GoogleStore[]; onboardingRequired: boolean; expiresAt: Date; newlyCreated: boolean }

export function onboardingInput(body: any) {
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName || companyName.length > 100) throw new AuthFlowError('onboarding', 'Completá el nombre de tu tienda.')
  return { companyName }
}

/** Tiendas a las que tiene acceso la persona Google, para el selector. */
export async function googleStores(subject: string): Promise<GoogleStore[]> {
  const accesses = await prisma.googleStoreAccess.findMany({
    where: { subject },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return accesses.map(access => ({ id: access.tenant.id, name: access.tenant.name, slug: access.tenant.slug }))
}

export async function googleCompany(identity: GoogleIdentity, body: any): Promise<GoogleCompanyResult> {
  if (body?.action === 'create') {
    const input = onboardingInput(body)
    const pinHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
    let tenant: { id: string; name: string; slug: string; settings: unknown }
    try {
      tenant = await prisma.$transaction(async tx => {
        // Never attach Google to an existing email or promote an existing user.
        const existing = await tx.tenant.findUnique({ where: { email: identity.email }, select: { id: true } })
        if (existing) {
          // Salvo que el correo sea de una tienda que ya pertenece a esta persona:
          // crear otra tienda de la misma persona no secuestra la cuenta por correo.
          const linked = await tx.googleStoreAccess.findFirst({ where: { subject: identity.sub, tenantId: existing.id }, select: { tenantId: true } })
          if (!linked) throw new AuthFlowError('existing_account', 'Este correo ya tiene una empresa. Entrá con contraseña; la vinculación con Google requiere validar al dueño.', 409)
        }
        const created = await tx.tenant.create({ data: { name: input.companyName, email: existing ? null : identity.email, emailVerifiedAt: existing ? null : new Date(), slug: `tienda-${randomBytes(16).toString('hex')}`, settings: { onboarding: { adminPinPending: true } } } })
        const admin = await tx.user.create({ data: { tenantId: created.id, name: identity.name?.slice(0, 100) || 'Administrador', email: identity.email, pinHash, role: 'ADMIN' } })
        await tx.googleIdentity.upsert({ where: { subject: identity.sub }, update: { name: identity.name || null, picture: identity.picture || null }, create: { subject: identity.sub, name: identity.name || null, picture: identity.picture || null } })
        await tx.googleStoreAccess.create({ data: { subject: identity.sub, tenantId: created.id, owner: true } })
        await tx.auditLog.create({ data: { tenantId: created.id, userId: admin.id, action: 'GOOGLE_STORE_OWNER_CREATED', entity: 'GoogleStoreAccess', metadata: {} } })
        return created
      })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new AuthFlowError('existing_account', 'La cuenta ya fue creada o el correo está en uso. Volvé a iniciar sesión.', 409)
      throw error
    }
    const stores = await googleStores(identity.sub)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86400_000)
    await prisma.session.create({ data: { tenantId: tenant.id, level: 'COMPANY', tokenHash: hashToken(token), deviceId: `google:${randomBytes(16).toString('hex')}`, expiresAt } })
    return { token, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, stores, onboardingRequired: requiresAdminPinSetup(tenant.settings), expiresAt, newlyCreated: true }
  }

  const accesses = await prisma.googleStoreAccess.findMany({
    where: { subject: identity.sub },
    include: { tenant: { select: { id: true, name: true, slug: true, settings: true } } },
    orderBy: { createdAt: 'asc' },
  })
  let tenant = accesses.length === 1 ? accesses[0].tenant : null
  if (typeof body?.storeId === 'string' && body.storeId) {
    const chosen = accesses.find(access => access.tenantId === body.storeId)
    if (!chosen) throw new AuthFlowError('no_access', 'No tenés acceso a esa tienda. Volvé a iniciar con Google.', 403)
    tenant = chosen.tenant
  } else if (accesses.length === 0) {
    throw new AuthFlowError('no_store', 'Esta cuenta todavía no tiene tienda. Completá el alta.', 409)
  } else if (accesses.length > 1) {
    return { storeRequired: true, stores: accesses.map(access => ({ id: access.tenant.id, name: access.tenant.name, slug: access.tenant.slug })) }
  }
  if (!tenant) throw new AuthFlowError('no_store', 'Esta cuenta todavía no tiene tienda. Completá el alta.', 409)
  // La identidad ya estaba vinculada: se refresca el perfil con cada acceso
  // para que el nombre real y la foto del dueño sigan al día en la sesión.
  await prisma.googleIdentity.upsert({ where: { subject: identity.sub }, update: { name: identity.name || null, picture: identity.picture || null }, create: { subject: identity.sub, name: identity.name || null, picture: identity.picture || null } })
  // El dueño vende con su nombre real: si el admin sigue con el nombre
  // genérico del alta y el perfil Google tiene nombre, se sincroniza para que
  // ventas, reportes y comprobantes muestren a la persona (no "Administrador").
  if (identity.name) {
    await prisma.user.updateMany({
      where: { tenantId: tenant.id, role: 'ADMIN', name: 'Administrador' },
      data: { name: identity.name.slice(0, 100) },
    })
  }
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 86400_000)
  await prisma.session.create({ data: { tenantId: tenant.id, level: 'COMPANY', tokenHash: hashToken(token), deviceId: `google:${randomBytes(16).toString('hex')}`, expiresAt } })
  return { token, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, stores: accesses.map(access => ({ id: access.tenant.id, name: access.tenant.name, slug: access.tenant.slug })), onboardingRequired: requiresAdminPinSetup(tenant.settings), expiresAt, newlyCreated: false }
}
