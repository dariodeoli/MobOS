// Partes puras de la llegada de mercadería (#408, unidad E): resumen, costos,
// clasificación de serie y redacción por permiso. Sin base ni red.

import { luhnValid, type ArrivalIssue } from './arrival-parse'
import { supplierBadge, type SupplierBadge } from './cost-visibility'

export type StoredIssue = ArrivalIssue & { source?: 'parse' | 'check' }

export type SummaryLine = {
  match: string
  destination: string
  serial: string | null
  unitId?: string | null
  orderItemId?: string | null
  customerId?: string | null
  costPyg: number | null
  originalCost: number | null
  issues: StoredIssue[]
}

export type ArrivalSummary = {
  total: number
  // Contadores del cartel «ingresaron N, pre-vendidos N, a CDE N...».
  ingresaron: number
  preVendidos: number
  aOtraSucursal: number
  devueltos: number
  tecnico: number
  faltaImei: number
  noLlegaron: number
  sobrantes: number
  porDestino: Record<string, number>
  porMatch: Record<string, number>
  errores: number
  avisos: number
  currency: 'USD' | 'PYG'
  // Solo con permiso de costos (se quitan al leer sin él).
  costUsd?: number | null
  costPyg?: number | null
  devueltoPyg?: number | null
}

export const DESTINATIONS = ['STOCK', 'OTRA_SUCURSAL', 'DEVOLVER', 'FALTA_IMEI', 'TECNICO'] as const
export const MATCHES = ['EXACTO', 'POR_MODELO', 'SOBRANTE', 'NO_LLEGO'] as const

export function isPreSold(line: { destination: string; orderItemId?: string | null; customerId?: string | null }): boolean {
  return line.destination === 'STOCK' && Boolean(line.orderItemId || line.customerId)
}

// Una línea «activa» es la que llegó físicamente; las NO_LLEGO no se validan.
export const isActiveLine = (line: { match: string }) => line.match !== 'NO_LLEGO'

export function summarizeArrival(lines: SummaryLine[], currency: 'USD' | 'PYG'): ArrivalSummary {
  const porDestino: Record<string, number> = Object.fromEntries(DESTINATIONS.map(item => [item, 0]))
  const porMatch: Record<string, number> = Object.fromEntries(MATCHES.map(item => [item, 0]))
  const out: ArrivalSummary = {
    total: lines.length, ingresaron: 0, preVendidos: 0, aOtraSucursal: 0, devueltos: 0, tecnico: 0, faltaImei: 0, noLlegaron: 0, sobrantes: 0,
    porDestino, porMatch, errores: 0, avisos: 0, currency, costUsd: currency === 'USD' ? 0 : null, costPyg: 0, devueltoPyg: 0,
  }
  for (const line of lines) {
    porMatch[line.match] = (porMatch[line.match] ?? 0) + 1
    if (!isActiveLine(line)) { out.noLlegaron += 1; continue }
    porDestino[line.destination] = (porDestino[line.destination] ?? 0) + 1
    if (line.match === 'SOBRANTE') out.sobrantes += 1
    for (const issue of line.issues) issue.severity === 'error' ? out.errores++ : out.avisos++
    const cost = line.costPyg ?? 0
    if (line.destination === 'DEVOLVER') { out.devueltos += 1; out.devueltoPyg = (out.devueltoPyg ?? 0) + cost; continue }
    if (line.destination === 'FALTA_IMEI') { out.faltaImei += 1; continue }
    if (line.destination === 'OTRA_SUCURSAL') out.aOtraSucursal += 1
    else if (line.destination === 'TECNICO') out.tecnico += 1
    else if (isPreSold(line)) out.preVendidos += 1
    else out.ingresaron += 1
    out.costPyg = (out.costPyg ?? 0) + cost
    if (currency === 'USD') out.costUsd = Math.round(((out.costUsd ?? 0) + (line.originalCost ?? 0)) * 100) / 100
  }
  return out
}

export function redactSummary(summary: ArrivalSummary | null, canSeeCost: boolean): ArrivalSummary | null {
  if (!summary || canSeeCost) return summary
  const { costUsd: _usd, costPyg: _pyg, devueltoPyg: _ret, ...rest } = summary
  return rest as ArrivalSummary
}

// Costo en guaraníes de una línea: USD × cotización, o el monto en Gs.
export function costPygOf(currency: 'USD' | 'PYG', original: number | null, rate: number | null): number | null {
  if (original === null || !Number.isFinite(original) || original < 0) return null
  if (currency === 'PYG') return Math.round(original)
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null
  return Math.round(original * rate)
}

export type SerialCheck = { kind: 'IMEI' | 'SERIE'; value: string } | { kind: 'INVALIDO'; message: string }

// IMEI de 15 dígitos con Luhn, o serie alfanumérica (iPad/Watch) de 6 a 20.
// `allowTrailingZeros`: el operador confirmó que un IMEI que termina en 000 es
// real; deja de ser «perdido por Excel» si pasa Luhn (la notación científica
// nunca llega acá: tiene letras o coma).
export function classifySerialInput(value: string, options: { allowTrailingZeros?: boolean } = {}): SerialCheck {
  const serial = value.replace(/[\s-]+/g, '').toUpperCase()
  if (/^\d{15}$/.test(serial)) {
    if (/0{3,}$/.test(serial) && !(options.allowTrailingZeros && luhnValid(serial))) return { kind: 'INVALIDO', message: 'IMEI perdido por Excel, corregir (termina en ceros)' }
    return luhnValid(serial) ? { kind: 'IMEI', value: serial } : { kind: 'INVALIDO', message: `IMEI inválido (no pasa Luhn): ${serial}` }
  }
  if (/^[A-Z0-9]{6,20}$/.test(serial) && /\d/.test(serial) && !/^\d+$/.test(serial)) return { kind: 'SERIE', value: serial }
  return { kind: 'INVALIDO', message: `IMEI/serie con formato inválido («${value}»)` }
}

export type RedactableSupplier = { id: string; name: string; code: string | null; icon?: string | null; color?: string | null }

// Proveedor de una línea: el nombre real solo para administración/gerencia;
// el resto recibe la sigla (nunca se deriva del nombre).
export function supplierView(supplier: RedactableSupplier | null | undefined, canSeeName: boolean): (SupplierBadge & { name?: string }) | null {
  if (!supplier) return null
  const badge = supplierBadge(supplier)
  return canSeeName ? { ...badge, name: supplier.name } : badge
}

export const hasError = (issues: Array<{ severity: string }>) => issues.some(issue => issue.severity === 'error')
