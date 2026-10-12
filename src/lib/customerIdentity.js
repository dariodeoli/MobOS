export function customerDisplayName(customer) {
  return customer.identityKind === 'PERSON' && customer.givenNames?.trim() && customer.surnames?.trim()
    ? `${customer.givenNames.trim()} ${customer.surnames.trim()}` : customer.name || ''
}
export function acceptedCustomerIdentity(form, result) {
  return { ...form, nameOfficial: result.nameOfficial ?? result.name, document: result.fullRuc || form.document,
    identityKind: '', givenNames: '', surnames: '', personConfirmed: false }
}
export function customerIdentityPayload(form) {
  const data = {}
  if (Object.hasOwn(form, 'nameOfficial') && form.nameOfficial !== undefined) {
    if (typeof form.nameOfficial !== 'string' || !form.nameOfficial.trim() || form.nameOfficial.length > 2000) throw new Error('El nombre fiscal debe ser texto no vacío de hasta 2000 caracteres.')
    data.nameOfficial = form.nameOfficial
  }
  if (form.identityKind === 'PERSON') {
    if (!form.personConfirmed) throw new Error('Confirme los nombres y apellidos revisados antes de guardar.')
    for (const key of ['givenNames', 'surnames']) {
      if (typeof form[key] !== 'string' || !form[key].trim() || form[key].length > 200 || form[key].includes(',')) throw new Error('Revise nombres y apellidos por separado, sin comas (hasta 200 caracteres).')
      data[key] = form[key].trim()
    }
    data.identityKind = 'PERSON'
  } else if (form.identityKind === 'COMPANY') data.identityKind = 'COMPANY'
  return data
}
