// Alta de cliente desde el buscador del POS: detecta si lo escrito es una
// cédula/RUC, lo valida con el mismo DV que RucField y arma el nombre visible.
import { parseRucInput } from '../components/shared/rucLookup.js'
import { nombreDesdeRuc } from './nombreDesdeRuc.js'

export const MENSAJE_DOCUMENTO_INVALIDO = 'Ingresá un RUC de 1 a 9 dígitos y, si incluís el guion, un dígito verificador válido. Podés completar los datos manualmente.'

// Una CI/RUC se escribe solo con dígitos, puntos y un guion. Se exigen 5 a 8
// dígitos de base para no confundir teléfonos (con 0 o 595 delante) con un RUC.
const FORMA_DOCUMENTO = /^\d[\d.\s]*(?:-\s*\d?)?$/

/**
 * @returns {null | { estado: 'valido', identity } | { estado: 'dv_invalido' }}
 * null = el texto no parece un documento (se trata como nombre/teléfono).
 */
export function detectarDocumento(texto) {
  const crudo = String(texto ?? '').trim()
  if (!crudo || !FORMA_DOCUMENTO.test(crudo)) return null
  const compacto = crudo.replace(/[.\s]/g, '')
  const base = compacto.split('-')[0]
  if (base.length < 5 || base.length > 8) return null
  const tieneGuion = compacto.includes('-')
  // «1234567-» todavía se está escribiendo: ni consulta ni aviso.
  if (tieneGuion && !/-\d$/.test(compacto)) return null
  const identity = parseRucInput(compacto)
  if (!identity) return tieneGuion ? { estado: 'dv_invalido' } : null
  return { estado: 'valido', identity }
}

/**
 * Nombre visible de una consulta de RUC/CI. Acepta la consulta completa
 * ({ nameOfficial, fullRuc… }) o solo el nombre oficial. La regla vive en
 * nombreDesdeRuc: personas «Nombres Apellidos» sin coma; empresas tal cual.
 */
export function nombreVisibleDesdeRuc(consulta) {
  return nombreDesdeRuc(typeof consulta === 'string' || consulta == null ? { nameOfficial: consulta } : consulta).nombreCompleto
}

// ¿La ficha ya tiene este documento? Compara la base, con o sin DV.
export function fichaTieneDocumento(cliente, identity) {
  const base = String(cliente?.document ?? '').replace(/[.\s]/g, '').split('-')[0]
  return Boolean(base) && base === identity.base
}
