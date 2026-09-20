// Códigos de barras de las etiquetas de producto/góndola. El SKU manda: si es
// un EAN-13 válido (12 o 13 dígitos con dígito verificador correcto) se usa
// EAN-13 nativo; cualquier otro texto sale como CODE128. Mismo criterio para el
// comando ESC/POS y para el respaldo HTML (JsBarcode).

// Dígito verificador EAN-13 de los primeros 12 dígitos (posición impar ×1,
// par ×3, redondeo a la decena).
export function digitoVerificadorEan(doce = '') {
  const digitos = String(doce ?? '').replace(/\D/g, '')
  if (digitos.length !== 12) return ''
  const suma = [...digitos].reduce((total, digito, indice) => total + Number(digito) * (indice % 2 === 0 ? 1 : 3), 0)
  return String((10 - (suma % 10)) % 10)
}

// Los 12 dígitos de datos de un EAN: descarta el verificador si viene.
export function doceDeEan(valor = '') {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  if (digitos.length === 12) return digitos
  if (digitos.length === 13) return digitos.slice(0, 12)
  return ''
}

// Acepta 12 dígitos (el verificador se calcula) o 13 con verificador correcto.
export function esEan13(valor = '') {
  const texto = String(valor ?? '').trim()
  if (!/^\d{12,13}$/.test(texto)) return false
  if (texto.length === 13) return digitoVerificadorEan(texto.slice(0, 12)) === texto[12]
  return true
}

export const formatoDeCodigo = (valor = '') => (esEan13(valor) ? 'ean13' : 'code128')

// Datos que van al código según el formato: EAN-13 sin el verificador (la
// impresora lo calcula); CODE128 con el texto tal cual.
export function datosDeCodigo(valor = '') {
  const texto = String(valor ?? '').trim()
  return formatoDeCodigo(texto) === 'ean13' ? doceDeEan(texto) : texto
}

export const ETIQUETA_FORMATO = { ean13: 'EAN-13', code128: 'CODE128' }
