// Verificación física de stock (sesión por sucursal/depósito). Partes puras:
// clasificar una lectura contra el alcance de la sesión y calcular el resumen.
// No ajusta stock: solo deja constancia de quién vio qué y cuándo.

export const VERIFICATION_OPEN = 'OPEN'
export const VERIFICATION_FINISHED = 'FINISHED'
export const VERIFICATION_CANCELLED = 'CANCELLED'

/** Estados de una unidad que se espera ver físicamente en el local. */
export const EXPECTED_STATUSES = ['AVAILABLE', 'RESERVED', 'DEFECTIVE'] as const

export type ScanReason = 'OTHER_BRANCH' | 'OTHER_LOCATION' | 'SOLD' | 'IN_TRANSIT' | 'REMOVED' | 'UNKNOWN'
export type ScanUnit = { status: string; branchId: string | null; locationId: string | null; removedAt?: Date | string | null }
export type ScanScope = { branchId: string; locationId: string | null }

/** Una lectura es verificada si la unidad está en el alcance; si no, es inesperada con su motivo. */
export function classifyScan(unit: ScanUnit | null, scope: ScanScope): { outcome: 'VERIFIED' } | { outcome: 'UNEXPECTED'; reason: ScanReason } {
  if (!unit) return { outcome: 'UNEXPECTED', reason: 'UNKNOWN' }
  if (unit.removedAt) return { outcome: 'UNEXPECTED', reason: 'REMOVED' }
  if (unit.status === 'SOLD') return { outcome: 'UNEXPECTED', reason: 'SOLD' }
  if (unit.status === 'IN_TRANSIT') return { outcome: 'UNEXPECTED', reason: 'IN_TRANSIT' }
  if (unit.branchId !== scope.branchId) return { outcome: 'UNEXPECTED', reason: 'OTHER_BRANCH' }
  if (scope.locationId && unit.locationId !== scope.locationId) return { outcome: 'UNEXPECTED', reason: 'OTHER_LOCATION' }
  return (EXPECTED_STATUSES as readonly string[]).includes(unit.status) ? { outcome: 'VERIFIED' } : { outcome: 'UNEXPECTED', reason: 'UNKNOWN' }
}

export type SessionSummary = { expected: number; verified: number; missing: number; unexpected: number; pending: string[]; percent: number }

/** Resumen vivo: esperadas vs. vistas (las inesperadas no cuentan como verificadas). */
export function summarizeVerification(expectedSerials: string[], scans: Array<{ serial: string; outcome: string }>): SessionSummary {
  const expected = new Set(expectedSerials)
  const seen = new Set(scans.filter(scan => scan.outcome === 'VERIFIED').map(scan => scan.serial))
  const pending = [...expected].filter(serial => !seen.has(serial)).sort()
  const verified = expected.size - pending.length
  const unexpected = new Set(scans.filter(scan => scan.outcome === 'UNEXPECTED').map(scan => scan.serial)).size
  return { expected: expected.size, verified, missing: pending.length, unexpected, pending, percent: expected.size ? Math.round((verified / expected.size) * 100) : 100 }
}

export const UNDO_WINDOW_MS = 60_000

/** Deshacer el check de una fila: solo quien verificó, dentro del minuto y si nadie verificó después. */
export function canUndoVerification(args: { verifiedAt: Date | string | null; verifiedById: string | null; userId: string; auditAt: Date | string | null; now?: Date }): boolean {
  const { verifiedAt, verifiedById, userId, auditAt, now = new Date() } = args
  if (!verifiedAt || !auditAt || verifiedById !== userId) return false
  const at = new Date(verifiedAt).getTime()
  if (Number.isNaN(at) || at !== new Date(auditAt).getTime()) return false
  return now.getTime() - at <= UNDO_WINDOW_MS && now.getTime() >= at - 1000
}
