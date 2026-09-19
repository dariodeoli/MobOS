// Normalizadores compartidos: el IMEI/serial se compara siempre en mayúsculas
// y sin separadores, y el teléfono se arma con código de país una sola vez.

export const serialKey = (value: unknown) => typeof value === 'string'
  ? value.trim().toUpperCase().replace(/[\s-]+/g, '').replace(/^MOBOS:/i, '')
  : ''

export const digitsOnly = (value: unknown) => String(value ?? '').replace(/\D/g, '')

// Devuelve el teléfono en formato internacional sin signos (para wa.me).
export function internationalPhone(phone: unknown, countryCode: unknown = '+595') {
  const digits = digitsOnly(phone).replace(/^0+/, '')
  const country = digitsOnly(countryCode)
  if (!digits) return ''
  return digits.startsWith(country) ? digits : `${country}${digits}`
}

// Política única de contraseña (patrón Scale OS adaptado): 12–128, con
// mayúscula, minúscula, número y símbolo, sin espacios, sin el correo adentro
// y sin claves comunes. Devuelve '' cuando está bien.
export const CLAVE_MINIMA = 12
const CLAVES_COMUNES = new Set(['123456789012', '1234567890ab', 'password1234', 'contrasena123', 'contraseña123', 'qwerty123456', 'admin1234567'])

export function validarClave(value: string, email = ''): string {
  if (value.length < CLAVE_MINIMA) return `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`
  if (Buffer.byteLength(value) > 128) return 'La contraseña puede tener hasta 128 caracteres.'
  if (/\s/.test(value)) return 'La contraseña no puede tener espacios.'
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) return 'La contraseña necesita mayúscula, minúscula, número y símbolo.'
  const local = String(email).split('@')[0]?.toLowerCase() || ''
  if (local.length >= 4 && value.toLowerCase().includes(local)) return 'La contraseña no puede contener tu correo.'
  if (CLAVES_COMUNES.has(value.toLowerCase())) return 'Elegí una contraseña menos común.'
  return ''
}
