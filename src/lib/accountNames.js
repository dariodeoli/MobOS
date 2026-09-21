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

// Nombre que se arma solo mientras se completan los datos (#141). El orden es:
// medio/banco · empresa · titular · cuenta. Ejemplos: "Banco Itaú - Darío
// Deoli", "Pix - Darío Deoli", "USDT - Darío Deoli" o "Banco Itaú - Empresa
// XYZ - Cuenta 1234".
export function nombreSugeridoDeCuenta(valores = {}) {
  const partes = []
  const moneda = valores.currencyLabel || (valores.currency === 'PYG' ? 'Gs' : valores.currency || '')
  if (valores.kind === 'TRANSFER') partes.push(valores.bank || 'Transferencia')
  else if (valores.kind === 'CARD') partes.push(valores.processor || 'Tarjeta')
  else if (valores.kind === 'CASH') partes.push(`Efectivo${moneda ? ` ${moneda}` : ''}`)
  else partes.push({ PIX: 'Pix', CRYPTO: 'USDT', TRADE_IN: 'Canje' }[valores.kind] || 'Cuenta')
  if (valores.company) partes.push(valores.company)
  if (valores.holder) partes.push(valores.holder)
  if (valores.accountNumber) partes.push(`Cuenta ${valores.accountNumber}`)
  return partes.filter(Boolean).join(' - ')
}
