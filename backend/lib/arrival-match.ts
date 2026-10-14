// Conciliación determinista de una llegada contra lo esperado (#408, unidad C).
// Pura: recibe las filas ya parseadas y las líneas abiertas de las compras de
// abastecimiento (o del envío) y devuelve, sin tocar la base, el emparejamiento
// de cada fila. Orden fijo: (0) filas declaradas «NO LLEGÓ», (1) serie exacta,
// (2) producto + condición contra las líneas abiertas de la más vieja a la más
// nueva, (3) el resto son sobrantes con aviso; lo esperado que nadie cubrió
// vuelve como filas NO_LLEGO. Nunca muta la entrada.

import type { ArrivalCondition, ArrivalDestination, ArrivalIssue, ArrivalSerialKind } from './arrival-parse'

export type ArrivalMatchKind = 'EXACTO' | 'POR_MODELO' | 'SOBRANTE' | 'NO_LLEGO'

export type ExpectedLine = {
  id: string // purchaseLineId
  productId: string
  condition: ArrivalCondition
  // Unidades todavía abiertas (pedidas y no recibidas).
  openQuantity: number
  // Series cargadas en la compra y todavía no recibidas.
  serials: string[]
  createdAt: string | Date
  purchaseId?: string | null
  needId?: string | null
  shipmentItemId?: string | null
}

export type MatchInputRow = {
  rowIndex: number
  productId: string | null
  condition: ArrivalCondition | null
  serial: string | null
  serialKind: ArrivalSerialKind
  declaredNoLlego: boolean
  destination: ArrivalDestination
  issues: ArrivalIssue[]
}

export type MatchLinks = {
  purchaseLineId: string | null
  purchaseId: string | null
  needId: string | null
  shipmentItemId: string | null
}

export type MatchedRow<T extends MatchInputRow = MatchInputRow> = T & MatchLinks & {
  match: ArrivalMatchKind
  // Fila generada para algo esperado que no llegó (no vino en el pegado).
  synthetic: boolean
}

export type ReconcileResult<T extends MatchInputRow = MatchInputRow> = {
  rows: Array<MatchedRow<T>>
  counts: Record<ArrivalMatchKind, number>
  warnings: ArrivalIssue[]
}

const NO_LINKS: MatchLinks = { purchaseLineId: null, purchaseId: null, needId: null, shipmentItemId: null }

function linksOf(line: ExpectedLine): MatchLinks {
  return { purchaseLineId: line.id, purchaseId: line.purchaseId ?? null, needId: line.needId ?? null, shipmentItemId: line.shipmentItemId ?? null }
}

function time(value: string | Date): number {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

type WorkLine = ExpectedLine & { remaining: number }

export function reconcileArrival<T extends MatchInputRow>(rows: T[], expected: ExpectedLine[]): ReconcileResult<T> {
  const lines: WorkLine[] = expected
    .map(line => ({ ...line, serials: line.serials.map(s => s.toUpperCase()), remaining: Math.max(0, line.openQuantity) }))
    .sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id))
  const result = new Map<number, MatchedRow<T>>()
  const set = (row: T, match: ArrivalMatchKind, links: MatchLinks, extra: ArrivalIssue[] = []) => {
    result.set(row.rowIndex, { ...row, ...links, match, synthetic: false, issues: [...row.issues, ...extra] })
  }
  const consume = (line: WorkLine, serial: string | null) => {
    line.remaining = Math.max(0, line.remaining - 1)
    if (serial) line.serials = line.serials.filter(s => s !== serial)
    else if (line.serials.length > line.remaining) line.serials = line.serials.slice(0, line.remaining)
  }
  const bySerial = (serial: string) => lines.find(line => line.serials.includes(serial))
  const byModel = (row: T) => lines.find(line =>
    line.remaining > 0 && row.productId !== null && line.productId === row.productId && (row.condition === null || line.condition === row.condition))

  const ordered = [...rows].sort((a, b) => a.rowIndex - b.rowIndex)

  // 0 · declaradas «NO LLEGÓ»: consumen lo esperado para no duplicarlo.
  for (const row of ordered.filter(item => item.declaredNoLlego)) {
    const serial = row.serial ? row.serial.toUpperCase() : null
    const line = (serial ? bySerial(serial) : undefined) ?? byModel(row)
    if (line) {
      consume(line, serial && line.serials.includes(serial) ? serial : null)
      set(row, 'NO_LLEGO', linksOf(line))
    } else {
      set(row, 'NO_LLEGO', NO_LINKS, [{ code: 'NO_LLEGO_SIN_PEDIDO', severity: 'warning', message: 'Marcada como «no llegó» pero no figura en lo pedido' }])
    }
  }

  // 1 · serie exacta.
  for (const row of ordered) {
    if (result.has(row.rowIndex) || !row.serial) continue
    const serial = row.serial.toUpperCase()
    const line = bySerial(serial)
    if (!line) continue
    const extra: ArrivalIssue[] = []
    if (row.productId && row.productId !== line.productId) {
      extra.push({ code: 'PRODUCTO_DISTINTO', severity: 'warning', message: 'La serie estaba cargada en la compra con otro producto' })
    }
    consume(line, serial)
    set(row, 'EXACTO', linksOf(line), extra)
  }

  // 2 · producto + condición, de la compra más vieja a la más nueva.
  for (const row of ordered) {
    if (result.has(row.rowIndex) || !row.productId) continue
    const line = byModel(row)
    if (!line) continue
    consume(line, null)
    set(row, 'POR_MODELO', linksOf(line))
  }

  // 3 · sobrantes.
  for (const row of ordered) {
    if (result.has(row.rowIndex)) continue
    const extra: ArrivalIssue[] = row.productId
      ? [{ code: 'SOBRANTE', severity: 'warning', message: 'No estaba pedido: ingresa como sobrante' }]
      : []
    set(row, 'SOBRANTE', NO_LINKS, extra)
  }

  const out: Array<MatchedRow<T>> = ordered.map(row => result.get(row.rowIndex) as MatchedRow<T>)

  // 4 · lo esperado que nadie cubrió → filas NO_LLEGO sintéticas.
  let next = ordered.reduce((max, row) => Math.max(max, row.rowIndex), 0)
  for (const line of lines) {
    for (let i = 0; i < line.remaining; i++) {
      next += 1
      const serial = line.serials[i] ?? null
      const row = {
        rowIndex: next, productId: line.productId, condition: line.condition, serial,
        serialKind: serial ? 'IMEI' : 'NINGUNO', declaredNoLlego: true, destination: 'STOCK', issues: [],
        ...linksOf(line), match: 'NO_LLEGO', synthetic: true,
      } as unknown as MatchedRow<T>
      out.push(row)
    }
  }

  const counts: Record<ArrivalMatchKind, number> = { EXACTO: 0, POR_MODELO: 0, SOBRANTE: 0, NO_LLEGO: 0 }
  for (const row of out) counts[row.match] += 1
  const warnings: ArrivalIssue[] = []
  if (counts.SOBRANTE) warnings.push({ code: 'SOBRANTES', severity: 'warning', message: `${counts.SOBRANTE} equipo(s) sobrante(s) que no estaban pedidos` })
  if (counts.NO_LLEGO) warnings.push({ code: 'NO_LLEGARON', severity: 'warning', message: `${counts.NO_LLEGO} equipo(s) pedido(s) no llegaron` })
  return { rows: out, counts, warnings }
}
