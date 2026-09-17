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
