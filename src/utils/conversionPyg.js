// Conversión de un monto en moneda extranjera a guaraníes con aritmética
// entera (BigInt), idéntica a la del servidor (payment-input.ts:
// `originalAmount.mul(exchangeRatePyg).toDecimalPlaces(0, ROUND_HALF_UP)`).
// Con floats `Math.round(2.01 * 7250)` daba 14.572 y el servidor 14.573.
// Sin imports ni React para poder testearla contra Prisma.Decimal.

// «12,50» / «12.5» / 7300 → { n: BigInt (sin coma), escala } o null si no es un
// decimal positivo bien formado (hasta 6 decimales, como acepta el servidor).
export function aEscalaEntera(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.')
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(texto)
  if (!m) return null
  const dec = m[2] || ''
  return { n: BigInt(m[1] + dec), escala: dec.length }
}

const pow10 = (e) => 10n ** BigInt(e)

// Redondeo HALF_UP de n / d (positivos).
const divHalfUp = (n, d) => (2n * n + d) / (2n * d)

/** Guaraníes enteros de `monto` × `cotizacion` (HALF_UP); NaN si algún dato no es válido. */
export function convertirAPyg(monto, cotizacion) {
  const a = aEscalaEntera(monto)
  const b = aEscalaEntera(cotizacion)
  if (!a || !b) return NaN
  return Number(divHalfUp(a.n * b.n, pow10(a.escala + b.escala)))
}

/**
 * Mayor monto en la moneda extranjera (string con coma, 2 decimales) cuya
 * conversión NO supera `pyg`. Redondea hacia abajo al centavo: nunca excede el
 * saldo (redondear al más cercano daba US$ 136,99 = Gs 1.000.027 > 1.000.000).
 */
export function montoMaximoEnMoneda(pyg, cotizacion) {
  const b = aEscalaEntera(cotizacion)
  const p = Math.floor(Number(pyg))
  if (!b || b.n <= 0n || !(p > 0)) return ''
  // centavos = floor(pyg × 100 / cotización)
  const centavos = (BigInt(p) * 100n * pow10(b.escala)) / b.n
  if (centavos <= 0n) return ''
  const c = centavos.toString().padStart(3, '0')
  return `${c.slice(0, -2)},${c.slice(-2)}`
}
