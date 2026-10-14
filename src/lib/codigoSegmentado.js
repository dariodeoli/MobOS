// Lógica pura del código segmentado (#372): formatos fijos como ABCDE-FGHIJ,
// GC-XXXX-XXXX-XXXX o un IMEI de 15 dígitos. Se separa del componente para
// poder probar pegado, normalización y validación sin DOM.

export const ALFABETOS = {
  numerico: /[^0-9]/g,
  letras: /[^A-Z]/g,
  alfanumerico: /[^0-9A-Z]/g,
  // Crockford (gift cards): O→0, I/L→1 antes de filtrar, igual que normalizarCodigoGiftCard.
  crockford: /[^0-9A-HJKMNP-TV-Z]/g,
}

/** Limpia lo tipeado/pegado: mayúsculas, quita guiones/espacios y filtra por alfabeto. */
export function limpiarCodigo(texto, alfabeto = 'alfanumerico', prefijo = '') {
  let t = String(texto ?? '').toUpperCase()
  if (alfabeto === 'crockford') t = t.replace(/O/g, '0').replace(/[IL]/g, '1')
  const re = ALFABETOS[alfabeto] || ALFABETOS.alfanumerico
  let limpio = t.replace(/[\s-]/g, '').replace(re, '')
  // Un pegado completo con prefijo («GC-…») no debe contarse como cuerpo.
  const p = String(prefijo || '').toUpperCase()
  if (p && limpio.startsWith(p) && t.replace(/[\s-]/g, '').startsWith(p)) limpio = limpio.slice(p.length)
  return limpio
}

/** Largo total del cuerpo = suma de grupos. */
export const largoCodigo = (grupos) => grupos.reduce((a, n) => a + n, 0)

/** Reparte el cuerpo en celdas (una por carácter), rellenando con ''. */
export function celdasDeCodigo(valor, grupos) {
  const total = largoCodigo(grupos)
  return Array.from({ length: total }, (_, i) => valor[i] || '')
}

/** Formatea el cuerpo con separador: ('ABCDEFGHIJ',[5,5],'-') → 'ABCDE-FGHIJ'. */
export function formatearCodigo(valor, grupos, separador = '-', prefijo = '') {
  const partes = []
  let i = 0
  for (const n of grupos) { partes.push(valor.slice(i, i + n)); i += n }
  const cuerpo = partes.filter((p, idx) => p || idx === 0).join(separador)
  return prefijo ? `${prefijo}${separador}${cuerpo}` : cuerpo
}

/** Inserta lo pegado en la posición `desde` (reemplaza lo que siga). */
export function insertarEnCodigo(valor, desde, pegado, largo) {
  return (valor.slice(0, desde) + pegado).slice(0, largo)
}

/** Estado de validación: 'vacio' | 'incompleto' | 'completo' | 'invalido'. */
export function estadoCodigo(valor, grupos, validar) {
  const total = largoCodigo(grupos)
  if (!valor) return 'vacio'
  if (valor.length < total) return 'incompleto'
  if (validar && !validar(valor)) return 'invalido'
  return 'completo'
}

/** Luhn para IMEI (15 dígitos). */
export function imeiValido(valor) {
  const d = String(valor || '')
  if (!/^\d{15}$/.test(d)) return false
  let suma = 0
  for (let i = 0; i < 15; i += 1) {
    let n = Number(d[14 - i])
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    suma += n
  }
  return suma % 10 === 0
}
