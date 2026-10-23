import { nombreDesdeRuc } from './nombreDesdeRuc.js'

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

/**
 * Partes del titular a partir del nombre legal del proveedor de RUC (#234).
 * El registro usa "APELLIDOS, NOMBRES": la coma separa los apellidos de los
 * nombres. Sin coma no se inventa el corte — el texto completo queda como
 * primer nombre y la persona termina de completar la ficha.
 */
export function partesDeNombreLegal(nombre) {
  const texto = String(nombre || '').trim().replace(/\s+/g, ' ')
  if (!texto) return null
  const [apellidosCrudo, nombresCrudo] = texto.includes(',') ? texto.split(',', 2) : ['', texto]
  const apellidos = String(apellidosCrudo || '').trim().split(' ').filter(Boolean)
  const nombres = String(nombresCrudo || '').trim().split(' ').filter(Boolean)
  return {
    lastName: apellidos[0] || '',
    // Un tercer apellido (poco común) se conserva junto al segundo: el formulario
    // tiene dos campos de apellido y no se pierde dato.
    secondLastName: apellidos.slice(1).join(' '),
    firstName: nombres[0] || '',
    middleName: nombres[1] || '',
    otherName: nombres.slice(2).join(' '),
  }
}

/** Solo las partes conocidas: al aplicar un nombre no se vacían campos. */
export function partesConocidas(nombre) {
  const partes = partesDeNombreLegal(nombre)
  if (!partes) return {}
  return Object.fromEntries(Object.entries(partes).filter(([, valor]) => Boolean(valor)))
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

// El extractor no acredita PERSON: aplicar exige revisar los nombres. Si la
// consulta es de una persona con apellidos y nombres separados, se sugieren
// «Nombres Apellidos» ya partidos (regla única nombreDesdeRuc); si no, los
// campos quedan vacíos. Nunca se conservan fragmentos del titular anterior.
export function aplicarIdentidadTitular(current, result) {
  const official = result?.nameOfficial ?? result?.name
  if (typeof official !== 'string' || !official.trim()) return current
  const nombre = nombreDesdeRuc(result)
  const sugerido = nombre.tipo === 'persona' && nombre.apellidos ? sugerirPartes(nombre) : {}
  return { ...current, firstName: '', middleName: '', otherName: '', lastName: '', secondLastName: '', ...sugerido,
    document: result.fullRuc || current.document, nameOfficial: official, personConfirmed: false }
}
function sugerirPartes({ nombres, apellidos }) {
  const n = nombres.split(' ').filter(Boolean)
  const a = apellidos.split(' ').filter(Boolean)
  return {
    firstName: n[0] || '', middleName: n[1] || '', otherName: n.slice(2).join(' '),
    // «De Oliveira Ortigoza»: el último apellido es el segundo; lo anterior, el primero.
    lastName: a.length > 1 ? a.slice(0, -1).join(' ') : a[0] || '', secondLastName: a.length > 1 ? a[a.length - 1] : '',
  }
}
export function validarRevisionTitular(data) {
  if (data.nameOfficial === undefined) return
  if (typeof data.nameOfficial !== 'string' || !data.nameOfficial.trim() || data.nameOfficial.length > 2000) throw new Error('Revisá el nombre fiscal consultado (hasta 2000 caracteres).')
  if (!data.personConfirmed) throw new Error('Revisá y confirmá los nombres y apellidos antes de guardar el titular.')
}
