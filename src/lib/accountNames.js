// Nombres y búsqueda de titulares/empresas (#143). Funciones puras, sin API:
// el orden de composición es 1º nombre → 2º → 3º → 1º apellido → 2º apellido.

/** Nombre compuesto del titular en el orden pedido. */
export function nombreCompleto(holder) {
  return [holder?.firstName, holder?.middleName, holder?.otherName, holder?.lastName, holder?.secondLastName]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean)
    .join(' ')
}

/** Apellidos primero, para ordenar listados de titulares. */
export function nombreOrdenable(holder) {
  return [holder?.lastName, holder?.secondLastName, holder?.firstName, holder?.middleName, holder?.otherName]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean)
    .join(' ')
}

/** Texto buscable de una entidad: nombre, documento/RUC y razón social. */
export function textoBuscable(entidad) {
  if (!entidad) return ''
  const partes = entidad.legalName
    ? [entidad.legalName, entidad.ruc]
    : [nombreCompleto(entidad), entidad.document, entidad.firstName, entidad.lastName]
  return partes.map((parte) => String(parte || '')).join(' ')
}

/**
 * Opciones para el buscador de titulares: titulares activos primero y después
 * las empresas/personas jurídicas, con el documento como detalle.
 */
export function opcionesDePartes(holders = [], companies = []) {
  const deTitulares = holders
    .filter((holder) => holder?.isActive !== false)
    .map((holder) => ({ value: `holder:${holder.id}`, tipo: 'holder', entidad: holder, label: nombreCompleto(holder) || 'Titular', detail: holder.document || '', badge: 'Titular' }))
  const deEmpresas = companies
    .filter((company) => company?.isActive !== false)
    .map((company) => ({ value: `company:${company.id}`, tipo: 'company', entidad: company, label: company.legalName || 'Empresa', detail: company.ruc || '', badge: 'Empresa' }))
  return [...deTitulares, ...deEmpresas]
}
