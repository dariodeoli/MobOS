// Teléfono del campo compartido (#461): el número se guarda y se muestra SIN el 0
// de marcado local («+595 983 123 456», nunca «+595 0983…»). Envuelve la
// composición/lectura de `owncoding-ui` para que cualquier pantalla que use el
// campo guarde el mismo formato.
import { componerTelefono as componerBase, parseTelefono as parseBase } from 'owncoding-ui'

/** Quita el 0 (o los 00) de marcado local al inicio del número nacional. */
export const sinCeroLocal = (numero) => String(numero ?? '').replace(/^\s*0+(?=\s*\d)/, '').trim()

export function componerTelefono({ countryCode, phone } = {}) {
  return componerBase({ countryCode, phone: sinCeroLocal(phone) })
}

export function parseTelefono(valor, ...resto) {
  const partes = parseBase(valor, ...resto)
  return partes && typeof partes === 'object' ? { ...partes, phone: sinCeroLocal(partes.phone) } : partes
}
