import { prisma } from './prisma'
import { AuthRateLimitError, consumeAuthAttemptWindow, hashToken } from './auth'
import type { AuthAttemptStore } from './auth'

const PROVIDER_BASE_URL = 'https://ruc.sun.com.py/api/ruc/'
const HOUR_MS = 60 * 60 * 1000
const MONTH_MS = 31 * 24 * HOUR_MS

export class RucLookupError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfterSeconds?: number) { super(message) }
}

export type NormalizedRuc = { input: string; lookup: string; formatted: string | null }

function digits(value: string) { return value.replace(/[^0-9]/g, '') }

/** Accepts common Paraguayan RUC formats but never guesses a check digit. */
export function normalizeRuc(input: unknown): NormalizedRuc {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw || raw.length > 32 || /[^0-9.\-\s]/.test(raw)) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const compact = raw.replace(/[.\s]/g, '')
  const hyphens = (compact.match(/-/g) || []).length
  if (hyphens > 1) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const [base, verifier] = compact.split('-')
  if (!/^\d{5,12}$/.test(base || '') || (verifier !== undefined && !/^\d$/.test(verifier))) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  // The source supports an exact RUC without its DV, so preserve it rather
  // than interpreting the final digit as a DV when a hyphen was omitted.
  return { input: raw, lookup: verifier === undefined ? base : `${base}-${verifier}`, formatted: verifier === undefined ? null : `${base}-${verifier}` }
}

export type RucQuotaDb = { $transaction: <T>(fn: (tx: AuthAttemptStore) => Promise<T>) => Promise<T> }

async function consumeWindow(tx: AuthAttemptStore, scope: string, fingerprint: string, limit: number, windowMs: number, now: Date, code: 'account_rate_limited' | 'installation_rate_limited', message: string) {
  try {
    return await consumeAuthAttemptWindow(tx, scope, fingerprint, limit, windowMs, now)
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) throw new RucLookupError(code, message, 429, cause.retryAfterSeconds)
    throw cause
  }
}

/**
 * Cuotas separadas por cuenta y por instalación autenticada, persistidas en
 * AuthAttempt (scope 'ruc:account' / 'ruc:installation', fingerprint derivado
 * en servidor, sin IDs en claro). Sobreviven reinicios y se limpian por ventana
 * en cada consumo: 1 hora por cuenta, 31 días por instalación, con los mismos
 * máximos de siempre (RUC_ACCOUNT_HOURLY_LIMIT / RUC_INSTALLATION_MONTHLY_LIMIT).
 */
export async function consumeRucQuota(accountId: string, installationId: string, options: { db?: RucQuotaDb; now?: Date } = {}) {
  const db = (options.db ?? prisma) as RucQuotaDb
  const now = options.now ?? new Date()
  const accountLimit = Number(process.env.RUC_ACCOUNT_HOURLY_LIMIT || 12)
  const installationLimit = Number(process.env.RUC_INSTALLATION_MONTHLY_LIMIT || 90)
  const accountFingerprint = hashToken(`ruc:account:${accountId}`)
  const installationFingerprint = hashToken(`ruc:installation:${installationId}`)
  const used = await db.$transaction(async tx => {
    const accountUsed = await consumeWindow(tx, 'ruc:account', accountFingerprint, accountLimit, HOUR_MS, now, 'account_rate_limited', 'Alcanzaste el límite temporal de consultas RUC. Intentá nuevamente más tarde o completá los datos manualmente.')
    const installationUsed = await consumeWindow(tx, 'ruc:installation', installationFingerprint, installationLimit, MONTH_MS, now, 'installation_rate_limited', 'La instalación alcanzó su cuota de consultas RUC. Podés completar los datos manualmente.')
    return { accountUsed, installationUsed }
  })
  return { accountRemaining: Math.max(0, accountLimit - used.accountUsed), installationRemaining: Math.max(0, installationLimit - used.installationUsed) }
}

function text(value: unknown, limit = 240) { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

function providerUrl(ruc: NormalizedRuc) {
  const configured = process.env.RUC_SUN_API_URL || PROVIDER_BASE_URL
  let url: URL
  try { url = new URL(configured) } catch { throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible. Completá los datos manualmente.', 503) }
  if (url.protocol !== 'https:' || url.hostname !== 'ruc.sun.com.py' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible. Completá los datos manualmente.', 503)
  url.pathname += encodeURIComponent(ruc.lookup)
  return url
}

export async function lookupRuc(input: unknown, options: { fetchImpl?: typeof fetch; now?: Date } = {}) {
  const query = normalizeRuc(input)
  const fetchImpl = options.fetchImpl || fetch
  const headers: HeadersInit = { Accept: 'application/json' }
  if (process.env.RUC_SUN_API_KEY) headers['X-API-Key'] = process.env.RUC_SUN_API_KEY
  let response: Response
  try {
    response = await fetchImpl(providerUrl(query), { headers, signal: AbortSignal.timeout(8_000), cache: 'no-store' })
  } catch {
    throw new RucLookupError('provider_unavailable', 'La consulta RUC no respondió. Completá o revisá los datos manualmente.', 503)
  }
  if (response.status === 404) throw new RucLookupError('not_found', 'No encontramos ese RUC. Verificá el número o cargá los datos manualmente.', 404)
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible ahora. Completá o revisá los datos manualmente.', 503)
  if (!response.ok) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible ahora. Completá o revisá los datos manualmente.', 503)
  let payload: Record<string, unknown>
  try { payload = record(await response.json()) } catch { throw new RucLookupError('provider_invalid', 'La consulta RUC devolvió una respuesta no válida. Completá los datos manualmente.', 503) }
  const name = text(payload.name || payload.razonSocial || payload.businessName)
  const ruc = text(payload.ruc || query.lookup.split('-')[0], 16)
  const dv = text(payload.dv, 2)
  const fullRuc = text(payload.fullRuc, 20) || (dv ? `${ruc}-${dv}` : query.formatted || ruc)
  if (!name || !/^\d{5,12}(?:-\d)?$/.test(fullRuc)) throw new RucLookupError('provider_invalid', 'La consulta RUC devolvió datos incompletos. Completá los datos manualmente.', 503)
  const sifen = record(payload.sifenMandate)
  const siara = record(payload.siara)
  const now = options.now || new Date()
  return {
    query: { normalized: query.lookup, fullRuc },
    result: {
      name, ruc, dv: dv || null, fullRuc, state: text(payload.state, 80) || null,
      publicationDateText: text(payload.publicationDateText, 80) || null,
      sifenMandate: Object.keys(sifen).length ? { group: text(sifen.group, 80) || null, startsAt: text(sifen.startsAt || sifen.startDate, 40) || null, sourceUrl: text(sifen.sourceUrl || sifen.url, 500) || null } : null,
      siara: Object.keys(siara).length ? { group: text(siara.group, 80) || null, category: text(siara.category, 100) || null, legalType: text(siara.legalType, 100) || null, city: text(siara.city, 100) || null, state: text(siara.state, 80) || null } : null,
    },
    reviewRequired: true,
    source: { provider: 'RUC SUN', documentationUrl: 'https://ruc.sun.com.py/api-docs', queriedAt: now.toISOString() },
  }
}
