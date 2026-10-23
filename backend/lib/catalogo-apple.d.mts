export type ModeloApple = {
  readonly id: string
  readonly familia: 'iPhone' | 'iPad' | 'Mac' | 'Apple Watch' | 'AirPods'
  readonly nombre: string
  readonly anio: number
  readonly capacidades: readonly string[]
  readonly colores: readonly string[]
}
export const CATALOGO_APPLE_VERSION: string
export const FAMILIAS_APPLE: readonly string[]
export const CATALOGO_APPLE: readonly ModeloApple[]
export function normalizarClaveModelo(valor: unknown): string
export function normalizarCapacidad(valor: unknown): string
export function modeloApple(nombreOId: string): ModeloApple | null
export function capacidadesDeModelo(nombreOId: string): readonly string[]
export function coloresDeModelo(nombreOId: string): readonly string[]
export function buscarModelosApple(texto: string, opciones?: { familia?: string; limite?: number }): ModeloApple[]
export function capacidadValida(nombreModelo: string, capacidad: string): boolean
