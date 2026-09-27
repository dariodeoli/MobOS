// Montos del backend (#148 §9): desde la migración a columnas BIGINT, Prisma
// devuelve los importes como `bigint`. La app opera con `number` —el tope de
// producto es 99.000.000.000, muy por debajo de Number.MAX_SAFE_INTEGER—, así
// que este helper marca el único borde de conversión y evita mezclas
// `bigint + number` (que TypeScript rechaza y en runtime revientan).
export const LIMITE_MONTO_GENERAL = 10_000_000_000
export const LIMITE_MONTO_VENTAS = 99_000_000_000
/** Tope del sistema: el mayor monto que un campo de la app puede guardar. */
export const LIMITE_MONTO_ALMACENABLE = LIMITE_MONTO_VENTAS

/** Importe legible por la app; null/undefined se leen como 0. */
export function numero(valor: bigint | number | null | undefined): number {
  if (typeof valor === 'bigint') return Number(valor)
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

/** Igual que `numero` pero conserva la ausencia de dato (null/undefined). */
export function numeroOpcional(valor: bigint | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'bigint') return Number(valor)
  return Number.isFinite(valor) ? valor : null
}
