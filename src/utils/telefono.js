// Validación de teléfono para WhatsApp y clientes.
// Paraguay (+595): solo móviles 9XXXXXXXX (9 dígitos después del código).
// Otros países: entre 6 y 12 dígitos, sin formato estricto.

export function normalizarTelefono(value) {
  return String(value || '').replace(/[^\d+]/g, '')
}

// Devuelve el teléfono en formato internacional sin signos (para wa.me).
export function internationalPhone(value, countryCode = '+595') {
  let digits = String(value || '').replace(/\D/g, '')
  const code = String(countryCode || '+595').replace(/\D/g, '') || '595'
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(code)) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `${code}${digits}`
}

export function telefonoValido(value, countryCode = '+595') {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return false
  const code = String(countryCode || '+595').replace(/\D/g, '')
  const local = digits.startsWith(code) ? digits.slice(code.length) : digits.startsWith('0') ? digits.slice(1) : digits
  if (code === '595') return /^9\d{8}$/.test(local)
  return local.length >= 6 && local.length <= 12
}

export const MENSAJE_TELEFONO = 'Teléfono inválido. Para Paraguay usá un móvil de 9 dígitos, ej: 0981 123 456 o +595 971 234567.'
