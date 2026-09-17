// Reglas puras de presencia: la pestaña está en línea si latió en los últimos
// 75 s (2,5x el pulso de 30 s) y solo se acumula consumo con actividad real.
export const VENTANA_EN_LINEA_MS = 75_000
export const INTERVALO_LATIDO_MS = 30_000
export const ALCANCE_MAX = 60

export function estaEnLinea(lastSeenAt: Date | string | null | undefined, ahora: Date = new Date()): boolean {
  if (!lastSeenAt) return false
  const visto = new Date(lastSeenAt).getTime()
  return Number.isFinite(visto) && ahora.getTime() - visto <= VENTANA_EN_LINEA_MS
}

export function acumularSegundos(ultimoLatido: Date | string | null | undefined, activo: boolean, ahora: Date = new Date()): number {
  if (!activo || !ultimoLatido) return 0
  const anterior = new Date(ultimoLatido).getTime()
  if (!Number.isFinite(anterior)) return 0
  const paso = ahora.getTime() - anterior
  if (paso <= 0 || paso > VENTANA_EN_LINEA_MS) return 0
  return Math.min(60, Math.round(paso / 1000))
}

export function normalizarAlcance(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const limpio = value.trim().slice(0, ALCANCE_MAX)
  return limpio || null
}
