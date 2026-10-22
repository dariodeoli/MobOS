import { normalizeTolerancePct } from './credit-rules'

// Configuración del módulo «Venta a crédito» (Tenant.settings.moduleConfig.cuotas)
// y cálculo del plazo de una venta. Todo puro (sin base de datos): el parser
// devuelve siempre valores seguros aunque el JSON guardado esté incompleto.

export const CREDIT_TERM_MODES = ['DIAS', 'DIA_MES', 'CUOTAS'] as const
export type CreditTermMode = typeof CREDIT_TERM_MODES[number]
export type CreditClientNotice = 'off' | 'whatsapp' | 'email'

export type CreditModuleConfig = {
  defaultLimitPyg: number
  tolerancePct: number
  plazo: { mode: CreditTermMode; days: number; dayOfMonth: number; installments: number; intervalDays: number; maxDays: number }
  avisos: { internosDiasAntes: number[]; cliente: CreditClientNotice; emailAuto: boolean }
}

export const CREDIT_MAX_LIMIT_PYG = 1_000_000_000_000
const DAY_MS = 86_400_000
const PY_OFFSET_MS = 3 * 3_600_000

export const DEFAULT_CREDIT_CONFIG: CreditModuleConfig = {
  defaultLimitPyg: 0,
  tolerancePct: 0,
  plazo: { mode: 'DIAS', days: 0, dayOfMonth: 10, installments: 3, intervalDays: 30, maxDays: 365 },
  avisos: { internosDiasAntes: [3, 0], cliente: 'off', emailAuto: false },
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const intIn = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback
}
export const isCreditTermMode = (value: unknown): value is CreditTermMode => (CREDIT_TERM_MODES as readonly unknown[]).includes(value)

/** Lee `settings.moduleConfig.cuotas` con valores por defecto seguros. */
export function parseCreditConfig(settings: unknown): CreditModuleConfig {
  const raw = record(record(record(settings).moduleConfig).cuotas)
  const plazo = record(raw.plazo)
  const avisos = record(raw.avisos)
  const d = DEFAULT_CREDIT_CONFIG
  const dias = Array.isArray(avisos.internosDiasAntes)
    ? [...new Set(avisos.internosDiasAntes.filter((v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 60))].sort((a, b) => b - a).slice(0, 6)
    : []
  return {
    defaultLimitPyg: intIn(raw.defaultLimitPyg, 0, CREDIT_MAX_LIMIT_PYG, d.defaultLimitPyg),
    tolerancePct: normalizeTolerancePct(raw.tolerancePct),
    plazo: {
      mode: isCreditTermMode(plazo.mode) ? plazo.mode : d.plazo.mode,
      days: intIn(plazo.days, 0, 365, d.plazo.days),
      dayOfMonth: intIn(plazo.dayOfMonth, 1, 31, d.plazo.dayOfMonth),
      installments: intIn(plazo.installments, 2, 24, d.plazo.installments),
      intervalDays: intIn(plazo.intervalDays, 1, 365, d.plazo.intervalDays),
      maxDays: intIn(plazo.maxDays, 1, 365, d.plazo.maxDays),
    },
    avisos: {
      internosDiasAntes: Array.isArray(avisos.internosDiasAntes) ? dias : [...d.avisos.internosDiasAntes],
      cliente: avisos.cliente === 'whatsapp' || avisos.cliente === 'email' ? avisos.cliente : 'off',
      emailAuto: avisos.emailAuto === true,
    },
  }
}

export type CustomerCreditTerms = {
  creditLimitPyg: number | bigint | null | undefined
  creditDays?: number | null
  creditTolerancePct?: number | null
  creditTermMode?: string | null
  creditDayOfMonth?: number | null
  creditInstallments?: number | null
}

/** Límite y tolerancia efectivos: la ficha manda; sin límite propio rige el del módulo y su tolerancia. */
export function effectiveCreditLimits(customer: CustomerCreditTerms | null | undefined, config: CreditModuleConfig): { limitPyg: number; tolerancePct: number; source: 'customer' | 'module' } {
  const own = Math.max(0, Math.trunc(Number(customer?.creditLimitPyg ?? 0) || 0))
  if (own > 0) {
    const pct = customer?.creditTolerancePct
    return { limitPyg: own, tolerancePct: pct === null || pct === undefined ? config.tolerancePct : normalizeTolerancePct(pct), source: 'customer' }
  }
  return { limitPyg: config.defaultLimitPyg, tolerancePct: config.tolerancePct, source: 'module' }
}

export type CreditSchedule = { dueAt: Date; amountPyg: number }
export type CreditTerm = {
  mode: CreditTermMode
  creditDays: number
  dueAt: Date
  installments: CreditSchedule[]
  maxDays: number
  exceedsMaxDays: boolean
}

/** Partes de la fecha en hora de Paraguay (UTC-3 fijo, como el resto del sistema). */
function pyParts(now: Date) {
  const local = new Date(now.getTime() - PY_OFFSET_MS)
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() }
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** Mediodía de Paraguay de esa fecha: queda del mismo día en ambos husos. */
const pyNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12 + 3, 0, 0))

/** Próximo día `dayOfMonth` (acotado al fin de mes) estrictamente posterior a hoy. */
export function nextDayOfMonth(now: Date, dayOfMonth: number): Date {
  const { y, m, d } = pyParts(now)
  const thisMonth = Math.min(dayOfMonth, daysInMonth(y, m))
  if (thisMonth > d) return pyNoon(y, m, thisMonth)
  const ny = m === 11 ? y + 1 : y
  const nm = (m + 1) % 12
  return pyNoon(ny, nm, Math.min(dayOfMonth, daysInMonth(ny, nm)))
}

/** Reparte el saldo en cuotas enteras: el resto va a la última. */
export function splitInstallments(totalPyg: number, count: number, intervalDays: number, now: Date): CreditSchedule[] {
  const total = Math.max(0, Math.trunc(totalPyg))
  const n = Math.max(1, Math.trunc(count))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => ({
    dueAt: new Date(now.getTime() + (i + 1) * intervalDays * DAY_MS),
    amountPyg: i === n - 1 ? total - base * (n - 1) : base,
  }))
}

/**
 * Plazo de una venta a crédito. Prioridad: lo que pide el vendedor (días o
 * fecha), luego la ficha del cliente, luego el módulo. `exceedsMaxDays` avisa
 * que hace falta una autorización CREDIT_DAYS.
 */
export function resolveCreditTerm(input: {
  customer?: CustomerCreditTerms | null; config: CreditModuleConfig; unpaidPyg: number; now?: Date
  requestedDays?: number | null; requestedDueAt?: Date | null
}): CreditTerm {
  const now = input.now ?? new Date()
  const { config, customer } = input
  const maxDays = config.plazo.maxDays
  const customerMode = isCreditTermMode(customer?.creditTermMode) ? customer!.creditTermMode as CreditTermMode : null
  const mode: CreditTermMode = input.requestedDays != null || input.requestedDueAt ? 'DIAS' : customerMode ?? config.plazo.mode
  let dueAt: Date
  let installments: CreditSchedule[] = []
  if (input.requestedDueAt) {
    dueAt = input.requestedDueAt
  } else if (mode === 'DIA_MES') {
    dueAt = nextDayOfMonth(now, customer?.creditDayOfMonth ?? config.plazo.dayOfMonth)
  } else if (mode === 'CUOTAS') {
    const count = customer?.creditInstallments ?? config.plazo.installments
    installments = splitInstallments(input.unpaidPyg, count, config.plazo.intervalDays, now)
    dueAt = installments[installments.length - 1].dueAt
  } else {
    const days = input.requestedDays ?? customer?.creditDays ?? config.plazo.days
    dueAt = new Date(now.getTime() + days * DAY_MS)
  }
  const creditDays = Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS))
  // Solo lo que elige el vendedor se controla contra el máximo: el plazo de la ficha o del módulo ya lo fijó administración.
  const chosenBySeller = input.requestedDays != null || Boolean(input.requestedDueAt)
  return { mode, creditDays, dueAt, installments, maxDays, exceedsMaxDays: chosenBySeller && creditDays > maxDays }
}

/** ¿El cliente tiene un plazo de crédito definido (por su ficha o por el módulo)? Sin plazo, entregar con saldo no es venta a crédito. */
export function creditTermEnabled(customer: CustomerCreditTerms | null | undefined, config: CreditModuleConfig): boolean {
  const mode = isCreditTermMode(customer?.creditTermMode) ? customer!.creditTermMode : config.plazo.mode
  if (mode === 'CUOTAS' || mode === 'DIA_MES') return true
  return Number(customer?.creditDays ?? config.plazo.days) > 0
}
