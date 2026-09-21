// Costo de una unidad de inventario: en guaraníes o en moneda extranjera con
// cotización. Reglas de la app (docs/CAMPOS.md): PYG sin decimales, el resto
// con hasta 2. El costo total en Gs (`costPyg`) es la fuente para reportes; si
// el costo no se cargó queda `null` (costo diferido, se completa después).

import type { PaymentCurrency } from '@prisma/client'

const INT_MAX = 2147483647
const RATE_MAX = 999999999
// Decimales por moneda: PYG no lleva; el resto, dos.
const DECIMALES: Record<string, number> = { PYG: 0, USD: 2, BRL: 2, EUR: 2, USDT: 2 }

export type CostoEntrada = {
  costPyg?: unknown
  originalCost?: unknown
  costCurrency?: unknown
  exchangeRatePyg?: unknown
}

export type CostoNormalizado = {
  costPyg: number | null
  originalCost: number | null
  costCurrency: PaymentCurrency
  exchangeRatePyg: number | null
}

export const monedaDeCosto = (valor: unknown): PaymentCurrency => (typeof valor === 'string' && DECIMALES[valor] !== undefined ? (valor as PaymentCurrency) : 'PYG')

const vacio = (valor: unknown) => valor === undefined || valor === null || valor === ''
const sinDecimalesExtra = (numero: number, decimales: number) => Math.abs(Math.round(numero * 10 ** decimales) - numero * 10 ** decimales) < 1e-9

function numeroValido(valor: unknown, etiqueta: string, decimales: number, maximo = INT_MAX, minimo = 0.000001) {
  const Mayus = `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)}`
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < minimo || numero > maximo) throw new Error(`Revisá ${etiqueta}.`)
  if (!sinDecimalesExtra(numero, decimales)) throw new Error(decimales === 0 ? `${Mayus} no lleva decimales.` : `${Mayus} admite hasta ${decimales} decimales.`)
  return numero
}

const conservar = (actual: Partial<CostoNormalizado>): CostoNormalizado => ({
  costPyg: actual.costPyg ?? null,
  originalCost: actual.originalCost ?? null,
  costCurrency: monedaDeCosto(actual.costCurrency),
  exchangeRatePyg: actual.exchangeRatePyg ?? null,
})

/**
 * Valida y normaliza el costo de una unidad. Lanza Error con el motivo cuando
 * el dato no respeta las reglas. `null` en `costPyg`/`originalCost` limpia el
 * costo (queda pendiente); sin campos de costo, conserva lo que ya tenía.
 */
export function normalizarCosto(entrada: CostoEntrada, actual: Partial<CostoNormalizado> = {}): CostoNormalizado {
  const moneda = entrada.costCurrency === undefined ? monedaDeCosto(actual.costCurrency) : monedaDeCosto(entrada.costCurrency)
  const decimales = DECIMALES[moneda] ?? 2
  const tocaCosto = entrada.costPyg !== undefined || entrada.originalCost !== undefined || entrada.exchangeRatePyg !== undefined || entrada.costCurrency !== undefined
  if (!tocaCosto) return conservar(actual)
  if (entrada.costPyg === null || entrada.originalCost === null) return { costPyg: null, originalCost: null, costCurrency: moneda, exchangeRatePyg: null }

  // El total en Gs es siempre entero; el monto original usa los decimales de su moneda.
  const costPyg = vacio(entrada.costPyg) ? undefined : numeroValido(entrada.costPyg, 'el costo en guaraníes', 0)
  const originalCost = vacio(entrada.originalCost) ? undefined : numeroValido(entrada.originalCost, `el costo en ${moneda}`, decimales)
  const exchangeRatePyg = vacio(entrada.exchangeRatePyg) ? undefined : numeroValido(entrada.exchangeRatePyg, 'la cotización', 4, RATE_MAX)
  if (costPyg === undefined && originalCost === undefined) throw new Error('Indicá el monto del costo.')

  // El total en Gs manda cuando viene explícito; si solo hay monto original, se
  // convierte con la cotización (la de la entrada o la que ya tenía la unidad)
  // y 1:1 cuando ya está en guaraníes.
  const rateEfectiva = exchangeRatePyg ?? (actual.exchangeRatePyg ?? undefined)
  let totalPyg = costPyg ?? null
  if (totalPyg === null && originalCost !== undefined) {
    if (moneda !== 'PYG' && rateEfectiva === undefined) throw new Error(`Cargá la cotización del ${moneda} para calcular el costo en guaraníes.`)
    totalPyg = Math.round(originalCost * (moneda === 'PYG' ? 1 : (rateEfectiva as number)))
    if (totalPyg > INT_MAX) throw new Error('El costo en guaraníes supera el máximo permitido.')
  }
  return {
    costPyg: totalPyg,
    // En guaraníes el monto original es el mismo total; en moneda extranjera se
    // conserva el precio original para mostrarlo tal como se cargó.
    originalCost: originalCost ?? (moneda === 'PYG' ? totalPyg : null),
    costCurrency: moneda,
    exchangeRatePyg: moneda === 'PYG' ? null : rateEfectiva ?? null,
  }
}

/** La unidad todavía no tiene costo cargado (costo diferido). */
export const sinCosto = (unit: { costPyg?: unknown; originalCost?: unknown } | null | undefined) =>
  Boolean(unit) && (unit!.costPyg === null || unit!.costPyg === undefined) && (unit!.originalCost === null || unit!.originalCost === undefined)
