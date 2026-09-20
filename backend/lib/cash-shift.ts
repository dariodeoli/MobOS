// Reglas del turno de caja por usuario: arqueo por denominación y diferencia
// contra el esperado. Vive acá para que la validación del cierre, el cálculo
// del efectivo esperado y los tests compartan una sola definición (el route no
// reimplementa la aritmética).

// Denominaciones válidas del arqueo en guaraníes (billetes y monedas). El
// orden es de mayor a menor: es el que usa el papel y la grilla de la pantalla.
export const DENOMINACIONES_PYG = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50] as const

export type CashBreakdown = Record<string, number>
export type CashBreakdownInput = { breakdown: CashBreakdown | null; countedPyg: number }

// El efectivo esperado nunca es negativo: los movimientos de salida pueden
// superar la apertura, pero el esperado se informa acotado a cero.
export function cashExpectedPyg({
  openingPyg,
  paymentsPyg = 0,
  movementsPyg = 0,
}: {
  openingPyg: number
  paymentsPyg?: number
  movementsPyg?: number
}): number {
  return Math.max(0, Number(openingPyg || 0) + Number(paymentsPyg || 0) + Number(movementsPyg || 0))
}

// Diferencia del arqueo: positiva si sobra efectivo, negativa si falta.
export function cashDifferencePyg(countedPyg: number, expectedPyg: number): number {
  return Number(countedPyg || 0) - Number(expectedPyg || 0)
}

// Total contado derivado de un desglose ya limpio.
export function cashBreakdownTotal(breakdown: CashBreakdown | null | undefined): number {
  if (!breakdown || typeof breakdown !== 'object') return 0
  let total = 0
  for (const [key, cantidad] of Object.entries(breakdown)) {
    const denom = Number(key)
    const count = Number(cantidad)
    if (!DENOMINACIONES_PYG.includes(denom as (typeof DENOMINACIONES_PYG)[number])) continue
    if (!Number.isInteger(count) || count <= 0) continue
    total += denom * count
  }
  return total
}

// Filas del arqueo para papel y pantalla: solo denominaciones cargadas, de
// mayor a menor, con su subtotal.
export function cashBreakdownRows(
  breakdown: CashBreakdown | null | undefined,
): Array<{ valor: number; cantidad: number; subtotal: number }> {
  if (!breakdown || typeof breakdown !== 'object') return []
  return DENOMINACIONES_PYG.filter((denom) => Number(breakdown[String(denom)] || 0) > 0)
    .map((denom) => {
      const cantidad = Number(breakdown[String(denom)] || 0)
      return { valor: denom, cantidad, subtotal: denom * cantidad }
    })
}

// Entrada del arqueo por denominación. Devuelve el mapa limpio y su total, o
// `null` cuando no vino (cierre con total manual), o `undefined` si es
// inválido. Espejo exacto de lo que aplica el POST de cierre.
export function countedBreakdownInput(value: unknown): CashBreakdownInput | undefined {
  if (value === null || value === undefined || value === '') return { breakdown: null, countedPyg: 0 }
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length || entries.length > DENOMINACIONES_PYG.length) return undefined
  const breakdown: CashBreakdown = {}
  let total = 0
  for (const [key, raw] of entries) {
    const denom = Number(key)
    const count = Number(raw)
    if (!DENOMINACIONES_PYG.includes(denom as (typeof DENOMINACIONES_PYG)[number])) return undefined
    if (!Number.isInteger(count) || count < 0 || count > 1000000) return undefined
    if (count > 0) {
      breakdown[String(denom)] = count
      total += denom * count
    }
    if (total > 2147483647) return undefined
  }
  return { breakdown, countedPyg: total }
}
