import { assertMembership } from './membership'
import { canCreateCompany } from './membership-rules'

/**
 * Resultado de una solicitud iniciada desde un conector externo.
 *
 * Esta función prepara el formulario de alta en la aplicación, pero no crea
 * empresas, sesiones, pertenencias ni tokens. La creación sólo puede ocurrir
 * después de que la persona confirme en la app y el endpoint normal vuelva a
 * ejecutar requireAccountContext/createCompany.
 */
export type CompanyCreationPreparation = {
  status: 'awaiting_app_confirmation'
  newCompanyRequiresOAuthConsent: true
  url: string
  expectedTenantId: string
  expectedUserId: string
}

export class CompanyCreationPreparationError extends Error {
  constructor(public code: 'INVALID_NAME' | 'ACCOUNT_NOT_FOUND' | 'COMPANY_CREATE_FORBIDDEN', message: string) {
    super(message)
    this.name = 'CompanyCreationPreparationError'
  }
}

type PreparationDb = Parameters<typeof assertMembership>[0] & {
  account: { findUnique(args: unknown): Promise<{ id: string } | null> }
}

export type CompanyCreationPreparationInput = {
  db: PreparationDb
  accountId: string | null | undefined
  tenantId: string | null | undefined
  userId: string | null | undefined
  companyName: unknown
}

function companyName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 2 || name.length > 100) {
    throw new CompanyCreationPreparationError('INVALID_NAME', 'Completá el nombre de la empresa (entre 2 y 100 caracteres).')
  }
  return name
}

/**
 * Revalida el contexto del conector y devuelve un deep link interno de la app.
 * No acepta un contexto incompleto ni confía en que el rol recibido por el
 * conector siga vigente: la pertenencia, el usuario vinculado y su estado se
 * consultan nuevamente en la base.
 */
export async function prepareCompanyCreation(input: CompanyCreationPreparationInput): Promise<CompanyCreationPreparation> {
  const name = companyName(input.companyName)
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : ''
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : ''
  const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
  if (!accountId || !tenantId || !userId) {
    throw new CompanyCreationPreparationError('COMPANY_CREATE_FORBIDDEN', 'No hay una cuenta y un usuario vinculado válidos.')
  }

  const account = await input.db.account.findUnique({ where: { id: accountId }, select: { id: true } })
  if (!account) throw new CompanyCreationPreparationError('ACCOUNT_NOT_FOUND', 'La cuenta vinculada ya no está disponible.')

  let membership
  try {
    membership = await assertMembership(input.db, accountId, tenantId)
  } catch {
    throw new CompanyCreationPreparationError('COMPANY_CREATE_FORBIDDEN', 'No tenés acceso activo a la empresa actual.')
  }

  if (membership.userId !== userId || !membership.user || membership.user.tenantId !== tenantId || !canCreateCompany(membership.role, membership.user)) {
    throw new CompanyCreationPreparationError('COMPANY_CREATE_FORBIDDEN', 'Solo el dueño con perfil administrador activo puede preparar otra empresa.')
  }

  const params = new URLSearchParams({
    crearEmpresa: '1',
    nombre: name,
    expectedTenantId: tenantId,
    expectedUserId: userId,
  })
  return {
    status: 'awaiting_app_confirmation',
    newCompanyRequiresOAuthConsent: true,
    url: `/mi-cuenta?${params.toString()}`,
    expectedTenantId: tenantId,
    expectedUserId: userId,
  }
}
