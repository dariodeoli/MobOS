import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { hashToken, requiresAdminPinSetup } from './auth'
import { audienceMatches, JwtError, listEnv, verifyJwtSignature } from './jwks'
import { AuthFlowError, type GoogleIdentity } from './google-oauth'
import { googleCompany } from './google-company'
import { consumeAuthNonce, NONCE_PATTERN, type NoncePurpose } from './auth-nonce'
import { appleFullName, exchangeAppleAuthorizationCode, sealAppleRefreshToken, type AppleIdentityClaims } from './apple-auth'

// Acceso nativo (app de iPhone): Apple y Google devuelven una sesión de EMPRESA
// (igual que el login con contraseña); el PIN después da la sesión de vendedor.
// Solo entran a cuentas con tienda ya vinculada: jamás crean cuentas ni tiendas.
export const NO_STORE_MESSAGE = 'No hay una tienda vinculada a esta cuenta'
const SESSION_MS = 7 * 86400_000

export type NativeStore = { id: string; name: string; slug: string }

export async function companySellers(tenantId: string) {
  return prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', OR: [{ branchId: null }, { branch: { isActive: true } }] }, select: { id: true, name: true, branchId: true, pinLength: true }, orderBy: { name: 'asc' } })
}

// ── Google (cliente iOS) ────────────────────────────────────────────────────
export function googleIosClientIds() { return listEnv('MOBOS_GOOGLE_IOS_CLIENT_ID') }

/** El claim `nonce` del idToken tiene que ser el nonce emitido por el servidor, que se consume una sola vez. */
export async function verifyGoogleNativeToken(idToken: unknown, nonce: unknown, purpose: NoncePurpose = 'login'): Promise<GoogleIdentity> {
  const audiences = googleIosClientIds()
  if (!audiences.length) throw new JwtError('not_configured')
  if (typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) throw new JwtError('bad_nonce')
  const claims = await verifyJwtSignature(idToken as string, 'https://www.googleapis.com/oauth2/v3/certs')
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || !audienceMatches(claims.aud, audiences)) throw new JwtError('invalid_claims')
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new JwtError('invalid_claims')
  if (claims.nonce !== nonce) throw new JwtError('bad_nonce')
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw new JwtError('invalid_claims')
  if (!(await consumeAuthNonce(nonce, purpose))) throw new JwtError('bad_nonce')
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '', picture: typeof claims.picture === 'string' && /^https:\/\//.test(claims.picture) && claims.picture.length <= 500 ? claims.picture : '' }
}

export type NativeLoginResult =
  | { storeRequired: true; stores: NativeStore[] }
  | { token: string; expiresAt: Date; tenant: NativeStore; stores: NativeStore[]; sellers: Awaited<ReturnType<typeof companySellers>>; onboardingRequired: boolean; scope: 'device:company' }

export async function googleNativeLogin(identity: GoogleIdentity, storeId?: string): Promise<NativeLoginResult> {
  // Sin acceso previo no se toca nada (ni siquiera se crea la cuenta).
  if (!(await prisma.googleStoreAccess.count({ where: { subject: identity.sub } }))) throw new AuthFlowError('no_store', NO_STORE_MESSAGE, 403)
  let result
  try {
    result = await googleCompany(identity, storeId ? { storeId } : {})
  } catch (cause) {
    if (cause instanceof AuthFlowError && (cause.code === 'no_store' || cause.code === 'onboarding_required')) throw new AuthFlowError('no_store', NO_STORE_MESSAGE, 403)
    throw cause
  }
  if (result.storeRequired) return { storeRequired: true, stores: result.stores }
  return { token: result.token, expiresAt: result.expiresAt, tenant: result.tenant, stores: result.stores, sellers: await companySellers(result.tenant.id), onboardingRequired: result.onboardingRequired, scope: 'device:company' }
}

// ── Apple ───────────────────────────────────────────────────────────────────
async function activeStores(accountId: string) {
  const rows = await prisma.tenantMembership.findMany({
    where: { accountId, revokedAt: null, tenant: { archivedAt: null } },
    include: { tenant: { select: { id: true, name: true, slug: true, settings: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map(row => row.tenant)
}

/**
 * Cuenta a la que corresponde la identidad de Apple, sin crear nada:
 * 1) ya vinculada por `sub`; 2) correo REAL verificado por Apple que coincide con
 * una cuenta de Google verificada, o con una cuenta de empresa cuyo correo fue
 * verificado. Los correos de relay privado solo sirven si ya se vincularon antes
 * (o con la sesión abierta, ver `linkAccountId`).
 */
export async function resolveAppleAccount(identity: AppleIdentityClaims, linkAccountId: string | null) {
  // 1) Siempre primero por `sub` (el correo puede cambiar o ser de relay). Con sesión abierta, una identidad
  // ya vinculada a OTRA cuenta no se puede mover ni usar para entrar a esa cuenta.
  const known = await prisma.appleIdentity.findUnique({ where: { subject: identity.sub }, select: { accountId: true } })
  if (known) {
    if (linkAccountId && known.accountId !== linkAccountId) throw new AuthFlowError('identity_in_use', 'Esa cuenta de Apple ya está vinculada a otra cuenta.', 409)
    return { accountId: known.accountId, linked: true }
  }
  if (linkAccountId) return { accountId: linkAccountId, linked: false }
  if (!identity.email || !identity.emailVerified || identity.isPrivateRelay) return null
  // GoogleIdentity.email es siempre un correo verificado por Google.
  const google = await prisma.googleIdentity.findFirst({ where: { email: identity.email }, select: { subject: true } })
  const viaGoogle = google ? await prisma.account.findUnique({ where: { googleSubject: google.subject }, select: { id: true } }) : null
  if (viaGoogle) return { accountId: viaGoogle.id, linked: false }
  const viaPassword = await prisma.account.findUnique({ where: { email: identity.email }, select: { id: true } })
  if (viaPassword) {
    const verified = await prisma.tenantMembership.count({ where: { accountId: viaPassword.id, revokedAt: null, tenant: { email: identity.email, emailVerifiedAt: { not: null } } } })
    if (verified) return { accountId: viaPassword.id, linked: false }
  }
  return null
}

export async function appleNativeLogin(identity: AppleIdentityClaims, input: { storeId?: string; authorizationCode?: unknown; fullName?: unknown; linkAccountId?: string | null; linkUserId?: string | null; deviceId?: string }): Promise<NativeLoginResult> {
  const resolved = await resolveAppleAccount(identity, input.linkAccountId ?? null)
  if (!resolved) throw new AuthFlowError('no_store', NO_STORE_MESSAGE, 403)
  const stores = await activeStores(resolved.accountId)
  if (!stores.length) throw new AuthFlowError('no_store', NO_STORE_MESSAGE, 403)
  let tenant = stores.length === 1 ? stores[0] : null
  if (input.storeId) {
    tenant = stores.find(store => store.id === input.storeId) ?? null
    if (!tenant) throw new AuthFlowError('no_access', 'No tenés acceso a esa tienda.', 403)
  } else if (!tenant) {
    // Todavía no se vincula nada: primero se elige la tienda.
    return { storeRequired: true, stores: stores.map(({ id, name, slug }) => ({ id, name, slug })) }
  }
  // Vincula/actualiza la identidad. El refresh token (si llegó el código) queda cifrado para revocar al borrar la cuenta.
  const refresh = await exchangeAppleAuthorizationCode(input.authorizationCode)
  const sealed = refresh ? sealAppleRefreshToken(identity.sub, refresh) : null
  const name = appleFullName(input.fullName)
  const alreadyLinked = resolved.linked
  await prisma.appleIdentity.upsert({
    where: { subject: identity.sub },
    create: { subject: identity.sub, accountId: resolved.accountId, email: identity.email, isPrivateRelay: identity.isPrivateRelay, name, refreshTokenEnc: sealed, lastUsedAt: new Date() },
    update: { email: identity.email ?? undefined, isPrivateRelay: identity.isPrivateRelay, ...(name ? { name } : {}), ...(sealed ? { refreshTokenEnc: sealed } : {}), lastUsedAt: new Date() },
  })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MS)
  await prisma.session.create({ data: { tenantId: tenant.id, accountId: resolved.accountId, level: 'COMPANY', tokenHash: hashToken(token), deviceId: input.deviceId || `apple:${randomBytes(16).toString('hex')}`, expiresAt } })
  if (!alreadyLinked) await prisma.auditLog.create({ data: { tenantId: tenant.id, userId: input.linkUserId ?? undefined, action: 'APPLE_LINKED', entity: 'AppleIdentity', entityId: resolved.accountId, metadata: { provider: 'apple', relay: identity.isPrivateRelay, via: input.linkAccountId ? 'session' : 'verified_email' } } })
  await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'APPLE_COMPANY_SIGNED_IN', entity: 'Session', metadata: { provider: 'apple', relay: identity.isPrivateRelay } } })
  return { token, expiresAt, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, stores: stores.map(({ id, name, slug }) => ({ id, name, slug })), sellers: await companySellers(tenant.id), onboardingRequired: requiresAdminPinSetup(tenant.settings), scope: 'device:company' }
}
