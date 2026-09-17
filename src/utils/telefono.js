// Validación de teléfono para WhatsApp y clientes.
// Paraguay (+595): solo móviles 9XXXXXXXX (9 dígitos después del código).
// Otros países: entre 6 y 12 dígitos, sin formato estricto.

export function normalizarTelefono(value) {
  return String(value || '').replace(/[^\d+]/g, '')
}

// Entrada de los campos de teléfono: sin letras, espacios ni separadores.
export function soloDigitos(value, max = 0) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return max > 0 ? digits.slice(0, max) : digits
}

// Código de país editable: siempre con "+" y hasta 4 dígitos (ej. +595, +55).
export function codigoPais(value) {
  const digits = soloDigitos(value, 4)
  return digits ? `+${digits}` : ''
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
