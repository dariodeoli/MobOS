type IdentityKind = 'PERSON' | 'COMPANY' | null
type CustomerIdentity = { nameOfficial?: string | null; identityKind?: IdentityKind; givenNames?: string | null; surnames?: string | null }
const identityKeys = ['nameOfficial', 'identityKind', 'givenNames', 'surnames'] as const
export const hasCustomerIdentity = (body: Record<string, unknown>) => identityKeys.some(key => Object.hasOwn(body, key))

// Validate raw fiscal text without changing its bytes (including outer spaces).
export function officialNameInput(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('El nombre fiscal debe ser texto no vacío de hasta 2000 caracteres.')
  return value
}
export function customerIdentityInput(body: Record<string, unknown>): CustomerIdentity {
  if (Object.hasOwn(body, 'displayName')) throw new Error('El nombre visible se calcula; no se puede enviar.')
  const data: CustomerIdentity = {}
  if (Object.hasOwn(body, 'nameOfficial')) data.nameOfficial = body.nameOfficial === null ? null : officialNameInput(body.nameOfficial)
  const tupleChanged = ['identityKind', 'givenNames', 'surnames'].some(key => Object.hasOwn(body, key))
  if (!tupleChanged) return data
  if (!Object.hasOwn(body, 'identityKind') || ![null, 'PERSON', 'COMPANY'].includes(body.identityKind as IdentityKind)) throw new Error('Confirme el tipo de identidad.')
  data.identityKind = body.identityKind as IdentityKind
  if (data.identityKind === 'PERSON') {
    // A complete, manually reviewed tuple is the explicit confirmation contract.
    for (const key of ['givenNames', 'surnames'] as const) {
      const value = body[key]
      if (typeof value !== 'string' || !value.trim() || value.length > 200 || value.includes(',')) throw new Error('Confirme nombres y apellidos por separado, sin comas (hasta 200 caracteres).')
      data[key] = value.trim()
    }
  } else {
    if ((body.givenNames != null && body.givenNames !== '') || (body.surnames != null && body.surnames !== '')) throw new Error('Solo una persona confirmada puede tener nombres y apellidos revisados.')
    data.givenNames = null
    data.surnames = null
  }
  return data
}
export function serializeCustomer<T extends Omit<CustomerIdentity, 'identityKind'> & { name: string; identityKind?: string | null }>(customer: T) {
  const displayName = customer.identityKind === 'PERSON' && customer.givenNames?.trim() && customer.surnames?.trim()
    ? `${customer.givenNames.trim()} ${customer.surnames.trim()}` : customer.name
  return { ...customer, displayName }
}
