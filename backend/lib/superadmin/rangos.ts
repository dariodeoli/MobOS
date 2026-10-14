// Rangos de período, variaciones y buckets por día del panel de plataforma.
// Lógica pura: sin base de datos, sin Prisma. Los días se agrupan en la zona
// horaria del negocio (Paraguay), nunca en UTC.
export const ZONA = 'America/Asuncion'
export const PERIODOS = ['hoy', '7', '30', '90', 'mes', 'mes-anterior'] as const
export type Periodo = (typeof PERIODOS)[number]
export const PERIODO_DEFECTO: Periodo = '30'

export function normalizarPeriodo(valor: unknown): Periodo {
  return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor) ? (valor as Periodo) : PERIODO_DEFECTO
}

type Partes = { y: number; m: number; d: number; h: number; mi: number; s: number }

function partes(ms: number, zona: string): Partes {
  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const valores: Record<string, number> = {}
  for (const parte of formato.formatToParts(new Date(ms))) if (parte.type !== 'literal') valores[parte.type] = Number(parte.value)
  return { y: valores.year, m: valores.month, d: valores.day, h: valores.hour, mi: valores.minute, s: valores.second }
}

function desfaseMs(ms: number, zona: string): number {
  const p = partes(ms, zona)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

// Instante (UTC) de una hora de pared local expresada como si fuera UTC.
function instanteDePared(pared: number, zona: string): number {
  const primero = pared - desfaseMs(pared, zona)
  return pared - desfaseMs(primero, zona)
}

/** Inicio (00:00 local) del día que contiene `ms`, desplazado `dias` días. */
export function inicioDiaLocal(ms: number, dias = 0, zona = ZONA): number {
  const p = partes(ms, zona)
  return instanteDePared(Date.UTC(p.y, p.m - 1, p.d + dias), zona)
}

/** Inicio (día 1, 00:00 local) del mes que contiene `ms`, desplazado `meses` meses. */
export function inicioMesLocal(ms: number, meses = 0, zona = ZONA): number {
  const p = partes(ms, zona)
  return instanteDePared(Date.UTC(p.y, p.m - 1 + meses, 1), zona)
}

/** Día local `YYYY-MM-DD` de un instante. */
export function diaLocal(ms: number, zona = ZONA): string {
  const p = partes(ms, zona)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export type RangoPeriodo = {
  periodo: Periodo
  desde: Date
  hasta: Date
  previoDesde: Date
  previoHasta: Date
  /** Días locales del período, en orden. */
  dias: string[]
  /** Días locales del período anterior, en orden. */
  diasPrevios: string[]
}

/** Días locales cubiertos por [desde, hasta). */
export function diasDelRango(desde: number, hasta: number, zona = ZONA): string[] {
  const dias: string[] = []
  if (hasta <= desde) return dias
  let cursor = inicioDiaLocal(desde, 0, zona)
  const ultimo = inicioDiaLocal(hasta - 1, 0, zona)
  let guarda = 0
  while (cursor <= ultimo && guarda++ < 400) {
    dias.push(diaLocal(cursor, zona))
    cursor = inicioDiaLocal(cursor, 1, zona)
  }
  return dias
}

/**
 * Rango del período y del período anterior de igual duración.
 * - 7/30/90: los últimos N días locales, incluido hoy; el anterior son los N días previos.
 * - Hoy y mes actual: lo transcurrido hasta ahora, comparado con lo mismo transcurrido
 *   de ayer / del mes anterior (comparación justa, no un período entero contra uno parcial).
 * - Mes anterior: el mes calendario completo anterior; el previo es el mes previo, con la misma duración.
 */
export function rangoDePeriodo(periodo: Periodo, ahora: Date = new Date(), zona = ZONA): RangoPeriodo {
  const t = ahora.getTime()
  let desde: number, hasta: number, previoDesde: number
  if (periodo === 'hoy') {
    desde = inicioDiaLocal(t, 0, zona); hasta = t; previoDesde = inicioDiaLocal(t, -1, zona)
  } else if (periodo === 'mes') {
    desde = inicioMesLocal(t, 0, zona); hasta = t; previoDesde = inicioMesLocal(t, -1, zona)
  } else if (periodo === 'mes-anterior') {
    desde = inicioMesLocal(t, -1, zona); hasta = inicioMesLocal(t, 0, zona); previoDesde = inicioMesLocal(t, -2, zona)
  } else {
    const n = Number(periodo)
    desde = inicioDiaLocal(t, -(n - 1), zona); hasta = inicioDiaLocal(t, 1, zona); previoDesde = inicioDiaLocal(t, -(2 * n - 1), zona)
  }
  const duracion = hasta - desde
  const previoHasta = Math.min(previoDesde + duracion, desde)
  return {
    periodo,
    desde: new Date(desde), hasta: new Date(hasta), previoDesde: new Date(previoDesde), previoHasta: new Date(previoHasta),
    dias: diasDelRango(desde, hasta, zona),
    diasPrevios: diasDelRango(previoDesde, previoHasta, zona),
  }
}

/** Variación porcentual con un decimal; null si el período anterior no tiene base (0). */
export function variacionPct(actual: number, previo: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(previo) || previo === 0) return null
  return Math.round(((actual - previo) / Math.abs(previo)) * 1000) / 10
}

export type PuntoSerie = { dia: string; valor: number }

/** Serie con un punto por día (los días sin filas valen 0). */
export function rellenarSerie(filas: ReadonlyArray<{ dia: string; valor: number }>, dias: readonly string[]): PuntoSerie[] {
  const porDia = new Map<string, number>()
  for (const fila of filas) porDia.set(fila.dia, (porDia.get(fila.dia) ?? 0) + Number(fila.valor || 0))
  return dias.map(dia => ({ dia, valor: porDia.get(dia) ?? 0 }))
}

export function sumaSerie(serie: readonly PuntoSerie[]): number {
  return serie.reduce((total, punto) => total + punto.valor, 0)
}
