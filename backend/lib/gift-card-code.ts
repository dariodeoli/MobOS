// Código de gift card (#280): helpers puros —generación, normalización y
// hash— compartidos por la validación de pagos y el canje. El código crudo se
// muestra una sola vez y en la base vive solo su sha256 (docs/TOKENS.md).
import { createHash, randomBytes } from 'node:crypto'

// Mismo criterio que el código de vinculación del puente de impresión: 12
// caracteres sobre 32 símbolos (60 bits) + límite de intentos, suficientes para
// un código que se tipea y se imprime. El prefijo GC lo distingue a simple
// vista.
export const GIFT_CARD_CODE_LENGTH = 12
const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function hashCodigoGiftCard(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** Normaliza el código tipeado (minúsculas, guiones, O/I/L) al formato canónico. */
export function normalizarCodigoGiftCard(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const limpio = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  const cuerpo = limpio.startsWith('GC') ? limpio.slice(2) : limpio
  if (cuerpo.length !== GIFT_CARD_CODE_LENGTH) return null
  return `GC-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`
}

export function codigoGiftCardValido(value: unknown): string | null {
  return normalizarCodigoGiftCard(value)
}

export function crearCodigoGiftCard(): { code: string; codeHash: string; last4: string } {
  // 256 es múltiplo de 32: el módulo sobre un byte no sesga el alfabeto.
  let cuerpo = ''
  for (let indice = 0; indice < GIFT_CARD_CODE_LENGTH; indice += 1) {
    cuerpo += ALFABETO_CROCKFORD[randomBytes(1)[0] % ALFABETO_CROCKFORD.length]
  }
  const code = `GC-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`
  return { code, codeHash: hashCodigoGiftCard(code), last4: cuerpo.slice(-4) }
}
