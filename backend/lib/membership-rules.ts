// Reglas puras de pertenencia a empresas (#377). Sin acceso a la base: se
// pueden probar en unitario y las usa lib/membership.ts dentro de transacciones.

export type MembershipRoleName = 'OWNER' | 'ADMIN' | 'MEMBER'

export function normalizeAccountEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email || null
}

export type ExistingAccount = {
  googleSubject: string | null
  memberships: Array<{ tenantId: string; revokedAt: Date | null }>
}

/**
 * Qué hacer con la cuenta que ya tiene el correo de una empresa cuando alguien
 * entra con la contraseña de ESA empresa. La contraseña prueba el control de la
 * empresa, nunca del correo: por eso una cuenta ajena (con Google o con otras
 * empresas) jamás se hereda por coincidir el correo.
 *  - create: no hay cuenta, se crea con el correo.
 *  - reuse: la cuenta ya está vinculada a esta empresa y activa.
 *  - revoked: estuvo vinculada y se la quitó (salir/eliminar): no se revive.
 *  - attach: cuenta vacía, sin Google ni empresas: se vincula a esta empresa.
 *  - refuse: cuenta con historia propia: la sesión queda sin cuenta.
 */
export function passwordAccountDecision(existing: ExistingAccount | null, tenantId: string): 'create' | 'reuse' | 'revoked' | 'attach' | 'refuse' {
  if (!existing) return 'create'
  const own = existing.memberships.find(membership => membership.tenantId === tenantId)
  if (own) return own.revokedAt ? 'revoked' : 'reuse'
  if (existing.googleSubject || existing.memberships.length > 0) return 'refuse'
  return 'attach'
}

/** Rol de la pertenencia que nace de un acceso Google a la tienda. */
export function roleForGoogleAccess(owner: boolean): MembershipRoleName {
  return owner ? 'OWNER' : 'ADMIN'
}

/** Solo el dueño de la empresa actual puede crear otra empresa. */
export function canCreateCompany(role: string | null | undefined) {
  return role === 'OWNER'
}

/**
 * La sesión de vendedor del destino solo se abre si quien cambia es la misma
 * persona vinculada a la cuenta en la empresa de origen; en cualquier otro caso
 * se muestra la pantalla de PIN.
 */
export function shouldKeepSeller(currentSellerUserId: string | null, linkedUserId: string | null) {
  return !!currentSellerUserId && !!linkedUserId && currentSellerUserId === linkedUserId
}

/** El perfil vinculado tiene que pertenecer a la empresa de la pertenencia. */
export function linkedUserBelongs(user: { tenantId: string } | null, tenantId: string) {
  return !user || user.tenantId === tenantId
}
