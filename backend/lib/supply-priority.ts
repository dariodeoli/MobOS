// Prioridad y costos de una necesidad del Centro de Abastecimiento (#254 · FIN).
//
// Lógica pura: la prioridad de compra sale del **origen** (qué demanda es), de
// la **venta** (si ya está confirmada), del **margen esperado** (venta − costo
// estimado) y de la **fecha prometida**. INV la usa al crear las automáticas y
// el panel muestra la efectiva; acá no hay estado ni base, solo reglas.
//
// Reglas (documentadas para el panel y los tests):
//   Base por origen: venta sin stock y pedido comprometido → ALTA;
//   reserva sin unidad, cantidad sobre stock y manual → NORMAL;
//   reposición bajo punto de reorden → BAJA.
//   Venta confirmada (cobrada): +1 escalón.
//   Margen esperado ≥ MARGEN_ALTO_PYG: +1; margen negativo: −1.
//   Fecha prometida vencida: URGENTE (piso); ≤ DIAS_URGENTE días: +2;
//   ≤ DIAS_ALTA días: +1; sin fecha o lejana: sin ajuste.
// Todo se acota entre BAJA y URGENTE: una fecha vencida siempre es URGENTE y
// una reposición preventiva sin apuro nunca sube sola.

export const PRIORIDADES_NECESIDAD = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const
export type PrioridadNecesidad = (typeof PRIORIDADES_NECESIDAD)[number]

const PESO: Record<string, number> = { BAJA: 1, NORMAL: 2, ALTA: 3, URGENTE: 4 }

/** Umbral de margen esperado que suma prioridad (Gs). */
export const MARGEN_ALTO_PYG = 1_000_000
/** Días para considerar la fecha prometida urgente / alta. */
export const DIAS_URGENTE = 2
export const DIAS_ALTA = 7

const BASE_POR_ORIGEN: Record<string, PrioridadNecesidad> = {
  SALE_NO_STOCK: 'ALTA',
  ORDER_COMMITTED: 'ALTA',
  RESERVATION_NO_STOCK: 'NORMAL',
  QUANTITY_OVER_STOCK: 'NORMAL',
  MANUAL: 'NORMAL',
  BELOW_REORDER: 'BAJA',
}

export type EntradaPrioridad = {
  origen: string
  /** Venta ya confirmada/cobrada (no una reserva o un pedido sin confirmar). */
  ventaConfirmada?: boolean | null
  /** Margen esperado de la venta vinculada (venta − costo objetivo), en Gs. */
  margenPyg?: number | null
  /** Fecha prometida al cliente (ISO o Date). */
  prometidaEl?: string | Date | null
  /** Hoy (para tests deterministas); por defecto, ahora. */
  hoy?: string | Date | null
}

const prioridadPorPeso = (peso: number): PrioridadNecesidad =>
  PRIORIDADES_NECESIDAD[Math.min(PRIORIDADES_NECESIDAD.length - 1, Math.max(0, peso - 1))]

/** Días de calendario entre hoy y la fecha prometida (negativo = vencida). */
function diasHasta(prometidaEl: string | Date | null | undefined, hoy: string | Date | null | undefined): number | null {
  if (prometidaEl === null || prometidaEl === undefined || prometidaEl === '') return null
  const cuando = prometidaEl instanceof Date ? prometidaEl : new Date(String(prometidaEl))
  if (Number.isNaN(cuando.getTime())) return null
  const referencia = hoy instanceof Date ? hoy : hoy ? new Date(String(hoy)) : new Date()
  if (Number.isNaN(referencia.getTime())) return null
  const dia = (fecha: Date) => Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  return Math.round((dia(cuando) - dia(referencia)) / 86400000)
}

export function prioridadDeNecesidad(entrada: EntradaPrioridad): PrioridadNecesidad {
  const origen = String(entrada?.origen || 'MANUAL').toUpperCase()
  const base = BASE_POR_ORIGEN[origen] || 'NORMAL'
  let pasos = 0

  if (entrada?.ventaConfirmada === true) pasos += 1

  const margen = entrada?.margenPyg
  if (typeof margen === 'number' && Number.isFinite(margen)) {
    if (margen >= MARGEN_ALTO_PYG) pasos += 1
    else if (margen < 0) pasos -= 1
  }

  const dias = diasHasta(entrada?.prometidaEl, entrada?.hoy)
  if (dias !== null) {
    if (dias < 0) return 'URGENTE'
    if (dias <= DIAS_URGENTE) pasos += 2
    else if (dias <= DIAS_ALTA) pasos += 1
  }

  return prioridadPorPeso(PESO[base] + pasos)
}

/**
 * Prioridad efectiva de una necesidad ya guardada: lo único que cambia con el
 * tiempo es la **fecha prometida**, así que solo esa escalona sobre la
 * prioridad existente (una BAJA explícita sin fecha se respeta; vencida, sube).
 */
export function prioridadPorFecha(prioridad: string, { prometidaEl, hoy }: { prometidaEl?: string | Date | null; hoy?: string | Date | null } = {}): PrioridadNecesidad {
  const guardada = String(prioridad || '').toUpperCase()
  const base: PrioridadNecesidad = (PRIORIDADES_NECESIDAD as readonly string[]).includes(guardada)
    ? (guardada as PrioridadNecesidad)
    : 'NORMAL'
  const dias = diasHasta(prometidaEl, hoy)
  if (dias === null) return base
  if (dias < 0) return 'URGENTE'
  if (dias <= DIAS_URGENTE) return prioridadPorPeso(PESO[base] + 2)
  if (dias <= DIAS_ALTA) return prioridadPorPeso(PESO[base] + 1)
  return base
}

/** Costo estimado de la necesidad: costo unitario conocido × cantidad. */
export function costoEstimadoDeNecesidad({ costoUnitarioPyg, cantidad }: { costoUnitarioPyg?: number | null; cantidad: number }): number | null {
  const costo = Number(costoUnitarioPyg)
  if (costoUnitarioPyg === null || costoUnitarioPyg === undefined || !Number.isFinite(costo) || costo < 0) return null
  const unidades = Number(cantidad) > 0 ? Math.round(Number(cantidad)) : 1
  return Math.round(costo * unidades)
}

/**
 * Margen esperado de la necesidad: (precio de venta unitario − costo unitario
 * estimado) × cantidad. `null` si falta el precio de la venta o el costo.
 */
export function margenEstimadoDeNecesidad({ precioUnitarioPyg, costoUnitarioPyg, cantidad }: { precioUnitarioPyg?: number | null; costoUnitarioPyg?: number | null; cantidad: number }): number | null {
  const precio = Number(precioUnitarioPyg)
  const costo = Number(costoUnitarioPyg)
  if (precioUnitarioPyg === null || precioUnitarioPyg === undefined || !Number.isFinite(precio) || precio < 0) return null
  if (costoUnitarioPyg === null || costoUnitarioPyg === undefined || !Number.isFinite(costo) || costo < 0) return null
  const unidades = Number(cantidad) > 0 ? Math.round(Number(cantidad)) : 1
  return Math.round((precio - costo) * unidades)
}
