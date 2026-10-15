// Fórmula única del efectivo esperado (#461), sin Prisma para poder probarla aislada.
//   esperado = apertura + (cobros en efectivo − reembolsos en efectivo) + (ingresos − egresos de caja)
// Es el neto CON SIGNO: no se recorta en cero (un esperado negativo es una señal real: se retiró
// más de lo que había). La demo (src/lib/demoCash.js) replica esta misma suma.
export const esperadoCaja = (aperturaPyg: number, movilPyg: number) => Number(aperturaPyg) + Number(movilPyg)

// Esperado por moneda (#455): la MISMA fórmula con signo para cada moneda. La apertura del turno
// es solo en guaraníes (openingPyg); las demás monedas arrancan en cero. Siempre devuelve PYG y USD.
export type PorMoneda = Record<string, number>
export const MONEDAS_CAJA = ['PYG', 'USD'] as const
const redondear = (moneda: string, valor: number) => (moneda === 'PYG' ? Math.round(valor) : Math.round(valor * 100) / 100)
export function esperadoPorMoneda(aperturaPyg: number, movilPorMoneda: PorMoneda): PorMoneda {
  const monedas = new Set<string>([...MONEDAS_CAJA, ...Object.keys(movilPorMoneda)])
  const salida: PorMoneda = {}
  for (const moneda of monedas) {
    salida[moneda] = redondear(moneda, esperadoCaja(moneda === 'PYG' ? aperturaPyg : 0, movilPorMoneda[moneda] ?? 0))
  }
  return salida
}

/** Vuelto en guaraníes de un cobro en efectivo: valor de lo entregado − lo aplicado a la venta (HALF_UP). */
export function vueltoPyg(entregado: number, cotizacionPyg: number, aplicadoPyg: number): number {
  return Math.max(0, Math.round(entregado * cotizacionPyg) - aplicadoPyg)
}
